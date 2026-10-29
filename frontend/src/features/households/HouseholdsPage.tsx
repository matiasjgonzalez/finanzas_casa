import { ChevronRight, House, Plus } from 'lucide-react'
import { Link } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useHouseholds } from '@/features/households/useHouseholds'
import { StatusBadge } from '@/features/users/UserBadges'

export function HouseholdsPage() {
  const { data: households, error, isPending, refetch } = useHouseholds()

  return (
    <>
      <PageHeader
        title="Hogares"
        description="Cada hogar tiene sus propios usuarios, categorías, pagos y servicios. Desde acá no se ven sus datos financieros."
        actions={
          <Button asChild>
            <Link to="/hogares/nuevo">
              <Plus aria-hidden="true" /> Nuevo hogar
            </Link>
          </Button>
        }
      />
      {isPending ? (
        <LoadingRows />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : households.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Todavía no hay hogares. Creá el primero con su administrador.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {households.map((h) => (
            <li key={h.id}>
              <Link
                to={`/hogares/${h.id}`}
                className="bg-card hover:border-brand focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
              >
                <span className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <House className="size-5" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{h.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {h.users_count} {h.users_count === 1 ? 'usuario' : 'usuarios'}
                    {h.admins_count === 0 && <span className="text-warning"> · sin administrador</span>}
                  </span>
                </span>
                <StatusBadge active={h.is_active} />
                <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
