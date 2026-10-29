import { ArrowLeft, CalendarClock } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCurrentUser } from '@/features/auth/useAuth'
import { useCategories } from '@/features/catalog/useCatalog'
import { FREQUENCY_LABELS, periodPath, type Service } from '@/features/services/api'
import { PeriodStatusBadge } from '@/features/services/PeriodStatusBadge'
import { DueDateHistoryChart } from '@/features/reports/views'
import { DueDateEditor } from '@/features/services/DueDateEditor'
import {
  useService,
  useServiceHistory,
  useServices,
} from '@/features/services/useServices'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

function amountLabel(s: Service): string {
  const amount = s.estimated_amount ? formatMoney(s.estimated_amount, s.currency) : null
  if (s.amount_type === 'fixed') return amount ?? '—'
  return amount ? `Variable · aprox. ${amount}` : 'Variable'
}

export function ServicesPage() {
  const { isAdmin } = useCurrentUser()
  const [showInactive, setShowInactive] = useState(false)
  const { data, error, isPending, refetch } = useServices(isAdmin && showInactive)

  return (
    <section aria-labelledby="servicios-titulo" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="servicios-titulo" className="text-lg font-semibold">
            Vencimientos programados
          </h2>
          <p className="text-muted-foreground text-sm">
            Los tipos de cada categoría que tienen vencimiento (servicios, tarjetas, patentes…).
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              Mostrar sin vencimiento
            </label>
            <Button asChild variant="outline">
              <Link to="/administracion/categorias">
                <CalendarClock aria-hidden="true" /> Programar en Categorías
              </Link>
            </Button>
          </div>
        )}
      </div>
      {isPending ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CalendarClock className="text-muted-foreground size-8" aria-hidden="true" />
            <p className="font-medium">Todavía no hay vencimientos programados.</p>
            <p className="text-muted-foreground max-w-md text-sm">
              En Administración → Categorías, tocá un tipo (Luz, Visa, Patente…) y elegí
              «Vencimiento…». Desde ahí figura en el calendario y te avisa cada vencimiento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <ul className="divide-y">
              {data.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/calendario/servicios/${s.id}`}
                    className={cn('hover:bg-accent flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3', !s.is_active && 'opacity-60')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        {s.name}
                        {!s.is_active && <Badge variant="outline">Sin vencimiento</Badge>}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {periodPath(s)} · {FREQUENCY_LABELS[s.frequency]} · {amountLabel(s)}
                      </p>
                    </div>
                    {s.next_period && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Próximo: {formatDate(s.next_period.due_date)}</span>
                        <PeriodStatusBadge status={s.next_period.status} />
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  )
}

function History({ serviceId }: { serviceId: string }) {
  const { data, isPending } = useServiceHistory(serviceId)
  return (
    <Card className="py-0">
      <CardHeader className="pt-4">
        <CardTitle>Historial de vencimientos</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isPending ? (
          <div className="p-4">
            <LoadingRows rows={3} />
          </div>
        ) : !data?.length ? (
          <p className="text-muted-foreground p-4 text-sm">Todavía no hay vencimientos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Vencimiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead className="hidden pr-4 text-right sm:table-cell">Pagado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-4">
                    <Link to={`/calendario/vencimientos/${p.id}`} className="hover:underline">
                      {formatDate(p.due_date)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <PeriodStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.amount_due ? formatMoney(p.amount_due, p.currency) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden pr-4 text-right whitespace-nowrap tabular-nums sm:table-cell">
                    {p.amount_paid ? `${formatMoney(p.amount_paid, p.currency)} · ${formatDate(p.paid_on!)}` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function ScheduleCard({ service }: { service: Service }) {
  const categories = useCategories(true)
  const category = categories.data?.find((c) => c.id === service.category.id)
  const type = category?.types.find((t) => t.id === service.category_type?.id)
  const item = category?.items.find((i) => i.id === service.item?.id) ?? null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vencimiento</CardTitle>
      </CardHeader>
      <CardContent>
        {categories.isPending ? (
          <LoadingRows rows={3} />
        ) : category && type ? (
          <DueDateEditor key={service.id} category={category} type={type} item={item} service={service} />
        ) : (
          <p className="text-muted-foreground text-sm">No se encontró el tipo de este vencimiento.</p>
        )}
        <p className="text-muted-foreground mt-4 text-xs">
          Un nuevo importe se aplica a los próximos vencimientos; los pasados y los corregidos a
          mano no cambian.
        </p>
      </CardContent>
    </Card>
  )
}

export function ServiceDetailPage() {
  const { serviceId = '' } = useParams()
  const { isAdmin } = useCurrentUser()
  const { data: service, error, isPending, refetch } = useService(serviceId)

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/calendario/servicios">
          <ArrowLeft aria-hidden="true" /> Programados
        </Link>
      </Button>
      {isPending ? (
        <LoadingRows rows={5} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <div>
            <h2 className="text-xl font-semibold">{service.name}</h2>
            <p className="text-muted-foreground text-sm">
              {periodPath(service)} · {FREQUENCY_LABELS[service.frequency]} · {amountLabel(service)}
            </p>
          </div>
          {isAdmin ? (
            <ScheduleCard service={service} />
          ) : (
            <Label className="text-muted-foreground text-sm font-normal">
              Los vencimientos los programa un administrador.
            </Label>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Lo pagado mes a mes</CardTitle>
            </CardHeader>
            <CardContent>
              <DueDateHistoryChart
                categoryId={service.category.id}
                typeId={service.category_type?.id}
                itemId={service.item?.id}
              />
            </CardContent>
          </Card>
          <History serviceId={service.id} />
        </>
      )}
    </div>
  )
}
