import { CalendarDays, CircleCheck, CircleAlert, Clock } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { type Period, periodPath } from '@/features/services/api'
import { usePeriods } from '@/features/services/useServices'
import { toISODate } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { daysUntil, dueDatePhrase } from '@/lib/relativeDate'
import { cn } from '@/lib/utils'

// Se miran las cuentas sin pagar del último año (vencidas) y de los próximos 30 días.
const PAST_DAYS = 365
const NEXT_DAYS = 30

function shift(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

function BillRow({ period }: { period: Period }) {
  const overdue = daysUntil(period.due_date) < 0
  return (
    <li
      className={cn(
        'bg-card flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border p-4 sm:p-5',
        overdue && 'border-destructive/50',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold">{period.service.name}</p>
        <p className={cn('text-sm', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
          {dueDatePhrase(period.due_date)}
        </p>
        <p className="text-muted-foreground text-sm">{periodPath(period)}</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-lg font-semibold whitespace-nowrap tabular-nums">
          {period.amount_due ? formatMoney(period.amount_due, period.currency) : 'Importe a definir'}
        </span>
        <Button asChild size="lg" className="h-12 px-6 text-base">
          <Link to={`/calendario/vencimientos/${period.id}`}>Pagar</Link>
        </Button>
      </div>
    </li>
  )
}

function Group({
  title,
  icon: Icon,
  tone,
  periods,
}: {
  title: string
  icon: typeof Clock
  tone: string
  periods: Period[]
}) {
  if (periods.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className={cn('flex items-center gap-2 text-lg font-semibold', tone)}>
        <Icon className="size-5" aria-hidden="true" />
        {title} ({periods.length})
      </h2>
      <ul className="flex flex-col gap-3">
        {periods.map((p) => (
          <BillRow key={p.id} period={p} />
        ))}
      </ul>
    </section>
  )
}

/** Las cuentas que hay que pagar, de la más urgente a la menos urgente. */
export function ToPayPage() {
  const { data, error, isPending, refetch } = usePeriods(shift(-PAST_DAYS), shift(NEXT_DAYS))
  const pending = (data ?? [])
    .filter((p) => p.status !== 'paid')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const overdue = pending.filter((p) => daysUntil(p.due_date) < 0)
  const thisWeek = pending.filter((p) => daysUntil(p.due_date) >= 0 && daysUntil(p.due_date) <= 7)
  const later = pending.filter((p) => daysUntil(p.due_date) > 7)

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Por pagar" description="Las cuentas que hay que pagar, primero las más urgentes." />
      {isPending ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : pending.length === 0 ? (
        <div className="bg-card rounded-3xl border">
          <EmptyState
            icon={CircleCheck}
            title="¡Todo al día!"
            description="No hay cuentas por pagar en los próximos 30 días."
          />
        </div>
      ) : (
        <>
          <Group title="Vencidas" icon={CircleAlert} tone="text-destructive" periods={overdue} />
          <Group title="Vencen esta semana" icon={Clock} tone="text-foreground" periods={thisWeek} />
          <Group title="Más adelante" icon={CalendarDays} tone="text-muted-foreground" periods={later} />
        </>
      )}
      <Link to="/calendario" className="text-brand self-start text-sm font-semibold hover:underline">
        Ver el calendario completo
      </Link>
    </div>
  )
}
