import { CircleCheck, CirclePlus, ClipboardList, type LucideIcon, ReceiptText, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { DateBlock } from '@/components/DateBlock'
import { EmptyState } from '@/components/EmptyState'
import { LoadingRows } from '@/components/QueryState'
import { SectionCard } from '@/components/SectionCard'
import { Button } from '@/components/ui/button'
import { useSummary } from '@/features/reports/useReports'
import { useAlerts } from '@/features/services/useServices'
import { paymentSubtitle, paymentTitle } from '@/features/transactions/types'
import { useTransactionList } from '@/features/transactions/useTransactions'
import { monthKey } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { daysUntil, dueDatePhrase } from '@/lib/relativeDate'
import { cn } from '@/lib/utils'

/** Botón grande de acción: ícono, título y un dato debajo. */
function ActionTile({
  to,
  icon: Icon,
  title,
  detail,
  primary = false,
}: {
  to: string
  icon: LucideIcon
  title: string
  detail: ReactNode
  primary?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'focus-visible:ring-ring/50 flex min-h-32 flex-col justify-between gap-4 rounded-3xl border p-5 transition-colors outline-none focus-visible:ring-3 sm:p-6',
        primary ? 'bg-primary text-primary-foreground hover:bg-primary/90 border-transparent' : 'bg-card hover:border-brand',
      )}
    >
      <Icon className={cn('size-8', primary ? '' : 'text-brand')} aria-hidden="true" />
      <span className="flex flex-col gap-1">
        <span className="text-xl font-semibold">{title}</span>
        <span className={cn('text-sm', primary ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{detail}</span>
      </span>
    </Link>
  )
}

function UpcomingBills() {
  const { data, isPending } = useAlerts(7)
  return (
    <SectionCard
      icon={ClipboardList}
      title="Cuentas para pagar pronto"
      footer={{ to: '/por-pagar', label: 'Ver todas las cuentas por pagar', icon: ClipboardList }}
      flush
    >
      {isPending ? (
        <div className="p-6">
          <LoadingRows rows={3} />
        </div>
      ) : !data?.items.length ? (
        <EmptyState icon={CircleCheck} title="¡Todo al día!" description="No hay cuentas para pagar esta semana." />
      ) : (
        <ul className="divide-y">
          {data.items.slice(0, 4).map((p) => {
            const overdue = daysUntil(p.due_date) < 0
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.service.name}</p>
                  <p className={cn('text-sm', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                    {dueDatePhrase(p.due_date)}
                    {p.amount_due && ` · ${formatMoney(p.amount_due, p.currency)}`}
                  </p>
                </div>
                <Button asChild className="h-11 px-5 text-base">
                  <Link to={`/calendario/vencimientos/${p.id}`}>Pagar</Link>
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}

function RecentPayments() {
  const { data, isPending } = useTransactionList({ sort: 'created', order: 'desc', page_size: 4 })
  return (
    <SectionCard
      icon={ReceiptText}
      title="Mis últimos pagos"
      footer={{ to: '/pagos', label: 'Ver todos los pagos hechos', icon: ReceiptText }}
      flush
    >
      {isPending ? (
        <div className="p-6">
          <LoadingRows rows={3} />
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={ReceiptText}
          title="Todavía no hay pagos"
          action={{ to: '/pagos/nuevo', label: 'Cargar el primero', icon: CirclePlus }}
        />
      ) : (
        <ul className="divide-y">
          {data.items.map((t) => (
            <li key={t.id}>
              <Link to={`/pagos/${t.id}`} className="hover:bg-accent flex items-center gap-4 px-5 py-4 sm:px-6">
                <DateBlock iso={t.occurred_on} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{paymentTitle(t)}</span>
                  <span className="text-muted-foreground block truncate text-sm">{paymentSubtitle(t)}</span>
                </span>
                <span className="font-semibold whitespace-nowrap tabular-nums">{formatMoney(t.amount, t.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

export function HomePage() {
  const alerts = useAlerts(7)
  const summary = useSummary(monthKey(new Date()))
  const pending = alerts.data ? alerts.data.overdue + alerts.data.due_soon : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">¿Qué querés hacer?</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <ActionTile to="/pagos/nuevo" icon={CirclePlus} title="Cargar un pago" detail="Anotar algo que se pagó" primary />
        <ActionTile
          to="/por-pagar"
          icon={ClipboardList}
          title="Por pagar"
          detail={
            pending === null ? (
              '…'
            ) : pending === 0 ? (
              'Todo al día esta semana'
            ) : (
              <>
                {pending} {pending === 1 ? 'cuenta' : 'cuentas'} esta semana
                {alerts.data!.overdue > 0 && (
                  <span className="text-destructive font-semibold"> · {alerts.data!.overdue} vencida{alerts.data!.overdue === 1 ? '' : 's'}</span>
                )}
              </>
            )
          }
        />
        <ActionTile
          to="/gastos"
          icon={Wallet}
          title="Cuánto gasté"
          detail={summary.data ? `${formatMoney(summary.data.total)} este mes` : '…'}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <UpcomingBills />
        <RecentPayments />
      </div>
    </div>
  )
}
