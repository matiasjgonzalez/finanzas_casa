import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listAuditLogs } from '@/features/audit/api'
import { actionLabel, describeDetails } from '@/features/audit/describe'
import { formatDateTime } from '@/lib/format'

const PAGE_SIZE = 25

export function AuditLogPage() {
  const [page, setPage] = useState(1)
  const { data, error, isPending, isPlaceholderData, refetch } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => listAuditLogs(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <section aria-labelledby="historial-titulo" className="flex flex-col gap-4">
      <h2 id="historial-titulo" className="text-lg font-semibold">
        Historial de acciones
      </h2>
      <Card className="py-0">
        <CardContent className="p-0">
          {isPending ? (
            <div className="p-4">
              <LoadingRows rows={5} />
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorMessage error={error} onRetry={() => refetch()} />
            </div>
          ) : data.items.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              Todavía no hay acciones registradas.
            </p>
          ) : (
            <Table aria-busy={isPlaceholderData}>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Fecha</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead className="hidden pr-4 md:table-cell">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground pl-4 whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>{log.actor_name ?? 'Sistema'}</TableCell>
                    <TableCell>
                      {actionLabel(log.action)}
                      <div className="text-muted-foreground text-xs whitespace-normal md:hidden">
                        {describeDetails(log)}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden pr-4 whitespace-normal md:table-cell">
                      {describeDetails(log)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {data && data.total > PAGE_SIZE && (
        <nav aria-label="Paginación" className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft aria-hidden="true" /> Anterior
          </Button>
          <span className="text-muted-foreground text-sm">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
          >
            Siguiente <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}
    </section>
  )
}
