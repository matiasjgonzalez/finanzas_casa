import { CalendarX2, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'

import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/useAuth'
import { type Period, periodPath } from '@/features/services/api'
import { DayBadge, MonthGrid, MonthNav } from '@/features/services/MonthCalendar'
import { useCalendarMonth } from '@/features/services/useCalendarMonth'
import { PeriodStatusBadge, StatusIcon } from '@/features/services/PeriodStatusBadge'
import { useAlerts, usePeriods } from '@/features/services/useServices'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Importe a mostrar: lo pagado, lo previsto o "a definir" (importe variable). */
function periodAmount(p: Period): string {
  const amount = p.amount_paid ?? p.amount_due
  return amount ? formatMoney(amount, p.currency) : 'Importe a definir'
}

function AlertsBanner() {
  const { data } = useAlerts(7)
  if (!data || (data.overdue === 0 && data.due_soon === 0)) return null
  const parts = [
    data.overdue > 0 && `${data.overdue} ${data.overdue === 1 ? 'vencimiento vencido' : 'vencimientos vencidos'}`,
    data.due_soon > 0 && `${data.due_soon} por vencer en los próximos ${data.days} días`,
  ].filter(Boolean)
  return (
    <Alert variant={data.overdue > 0 ? 'destructive' : 'default'}>
      <TriangleAlert aria-hidden="true" />
      <AlertDescription className="flex flex-col gap-1">
        <span className="font-medium">Tenés {parts.join(' y ')}.</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {data.items.slice(0, 5).map((p) => (
            <Link key={p.id} to={`/calendario/vencimientos/${p.id}`} className="underline underline-offset-2">
              {p.service.name} ({formatDate(p.due_date)})
            </Link>
          ))}
        </span>
      </AlertDescription>
    </Alert>
  )
}

function PeriodChip({ p }: { p: Period }) {
  return (
    <Link
      to={`/calendario/vencimientos/${p.id}`}
      className={cn(
        'hover:bg-accent flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs',
        p.status === 'paid' && 'text-muted-foreground',
        p.status === 'overdue' && 'border-destructive/40',
      )}
      title={`${p.service.name} · ${periodPath(p)} · ${periodAmount(p)}`}
    >
      <StatusIcon status={p.status} />
      <span className={cn('truncate', p.status === 'paid' && 'line-through')}>{p.service.name}</span>
    </Link>
  )
}

function MonthList({ periods }: { periods: Period[] }) {
  return (
    <Card className="py-0">
      <CardContent className="p-0">
        <ul className="divide-y">
          {periods.map((p) => (
            <li key={p.id}>
              <Link to={`/calendario/vencimientos/${p.id}`} className="hover:bg-accent flex items-center gap-3 px-4 py-3">
                <DayBadge iso={p.due_date} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.service.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{periodPath(p)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-medium whitespace-nowrap tabular-nums">{periodAmount(p)}</span>
                  <PeriodStatusBadge status={p.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** Calendario de vencimientos: los que se programan en cada tipo de las categorías. */
export function CalendarPage() {
  const { month, from, to, key, goTo } = useCalendarMonth()
  const { data, error, isPending, refetch } = usePeriods(from, to)
  const { isAdmin } = useCurrentUser()
  const inMonth = (data ?? []).filter((p) => p.due_date.startsWith(key))

  return (
    <div className="flex flex-col gap-4">
      <AlertsBanner />
      <MonthNav month={month} goTo={goTo} />

      {isPending ? (
        <LoadingRows rows={5} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="hidden md:block">
            <MonthGrid
              month={month}
              items={data}
              dateOf={(p) => p.due_date}
              keyOf={(p) => p.id}
              render={(p) => <PeriodChip p={p} />}
            />
          </div>
          <div className="md:hidden">{inMonth.length > 0 && <MonthList periods={inMonth} />}</div>
          {inMonth.length === 0 && (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-sm">
              <CalendarX2 className="size-7" aria-hidden="true" />
              <p>No hay vencimientos este mes.</p>
              {isAdmin ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/categorias">Programar vencimientos en Categorías</Link>
                </Button>
              ) : (
                <p>Los vencimientos los programa un administrador.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
