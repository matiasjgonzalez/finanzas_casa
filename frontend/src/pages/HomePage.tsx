import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, PiggyBank, ReceiptText } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/useAuth'
import { BarList, BudgetBar } from '@/features/reports/charts'
import { useBudgets, useProjection, useSummary } from '@/features/reports/useReports'
import { periodPath } from '@/features/services/api'
import { PeriodStatusBadge } from '@/features/services/PeriodStatusBadge'
import { useAlerts } from '@/features/services/useServices'
import { paymentSubtitle, paymentTitle } from '@/features/transactions/types'
import { useTransactionList } from '@/features/transactions/useTransactions'
import { formatMonth, monthKey } from '@/lib/dates'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

function StatTile({ label, value, detail, href }: { label: string; value: ReactNode; detail?: ReactNode; href: string }) {
  return (
    <Link
      to={href}
      className="bg-card hover:border-brand focus-visible:ring-ring/50 flex flex-col gap-1 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
    >
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      {detail && <span className="text-muted-foreground text-xs">{detail}</span>}
    </Link>
  )
}

/** Diferencia con el mes anterior: más gasto es "peor", por eso sube en rojo y baja en verde. */
function Change({ current, previous }: { current: string; previous: string }) {
  const now = Number(current)
  const before = Number(previous)
  if (before === 0) return <>Sin pagos el mes anterior</>
  const diff = ((now - before) / before) * 100
  const up = diff > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-flex items-center font-medium', up ? 'text-destructive' : 'text-positive')}>
        <Icon className="size-3.5" aria-hidden="true" />
        {up ? 'más' : 'menos'} {Math.abs(Math.round(diff))} %
      </span>
      que el mes anterior ({formatMoney(previous)})
    </span>
  )
}

function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <CardAction>
      <Button asChild variant="ghost" size="sm">
        <Link to={to}>
          {children} <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </CardAction>
  )
}

function DueDatesCard() {
  const { data, error, isPending, refetch } = useAlerts(7)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vencimientos</CardTitle>
        <CardDescription>Vencidos y los de los próximos 7 días.</CardDescription>
        <SectionLink to="/calendario">Calendario</SectionLink>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <LoadingRows rows={3} />
        ) : error ? (
          <ErrorMessage error={error} onRetry={() => refetch()} />
        ) : data.items.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <CalendarClock className="size-4" aria-hidden="true" /> No hay vencimientos pendientes esta semana.
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {data.items.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link
                  to={`/calendario/vencimientos/${p.id}`}
                  className="hover:bg-accent flex items-center gap-3 rounded-lg px-2 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.service.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      Vence el {formatDate(p.due_date)} · {periodPath(p)}
                    </p>
                  </div>
                  <span className="text-sm whitespace-nowrap tabular-nums">
                    {p.amount_due ? formatMoney(p.amount_due, p.currency) : 'A definir'}
                  </span>
                  <PeriodStatusBadge status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function BudgetsCard({ month }: { month: string }) {
  const { isAdmin } = useCurrentUser()
  const { data, isPending } = useBudgets(month)
  // Primero los superados, después los que están cerca del límite.
  const order = { exceeded: 0, warning: 1, ok: 2 }
  const items = [...(data ?? [])].sort((a, b) => order[a.status] - order[b.status]).slice(0, 4)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Presupuestos</CardTitle>
        <CardDescription>Cuánto se usó del límite de cada categoría este mes.</CardDescription>
        <SectionLink to="/presupuestos">Ver todos</SectionLink>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <LoadingRows rows={2} />
        ) : items.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <PiggyBank className="size-4" aria-hidden="true" />
            {isAdmin
              ? 'Todavía no hay presupuestos. Fijalos en la sección Presupuestos.'
              : 'Todavía no hay presupuestos (los fija un administrador).'}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((b) => (
              <li key={b.category.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{b.category.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatMoney(b.spent)} de {formatMoney(b.amount)}
                  </span>
                </div>
                <BudgetBar spent={b.spent} amount={b.amount} status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RecentPayments() {
  const { data, isPending } = useTransactionList({ sort: 'created', order: 'desc', page_size: 5 })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Últimos pagos cargados</CardTitle>
        <SectionLink to="/pagos">Pagos</SectionLink>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <LoadingRows rows={3} />
        ) : !data?.items.length ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <ReceiptText className="size-4" aria-hidden="true" /> Todavía no hay pagos cargados.
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {data.items.map((t) => (
              <li key={t.id}>
                <Link to={`/pagos/${t.id}`} className="hover:bg-accent flex items-center gap-3 rounded-lg px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{paymentTitle(t)}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {formatDate(t.occurred_on)} · {t.created_by.full_name}
                      {paymentSubtitle(t) && ` · ${paymentSubtitle(t)}`}
                    </p>
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap tabular-nums">
                    {formatMoney(t.amount, t.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function HomePage() {
  const { user } = useCurrentUser()
  const today = new Date()
  const month = monthKey(today)
  const summary = useSummary(month)
  const alerts = useAlerts(7)
  const projection = useProjection(month)
  const firstName = user.full_name.split(' ')[0]

  return (
    <>
      <PageHeader title={`Hola, ${firstName}`} description={`Resumen de ${formatMonth(today)}.`} />
      <div className="flex flex-col gap-4">
        {summary.error ? (
          <ErrorMessage error={summary.error} onRetry={() => summary.refetch()} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              href="/informes"
              label="Gastado este mes"
              value={summary.data ? formatMoney(summary.data.total) : '…'}
              detail={summary.data && <Change current={summary.data.total} previous={summary.data.previous_total} />}
            />
            <StatTile
              href="/informes?vista=mes"
              label="Proyección a fin de mes"
              value={projection.data ? formatMoney(projection.data.projected) : '…'}
              detail={
                projection.data &&
                (Number(projection.data.pending) > 0
                  ? `Faltan ${formatMoney(projection.data.pending)} en vencimientos`
                  : 'No quedan vencimientos con importe este mes')
              }
            />
            <StatTile
              href="/calendario/pagos"
              label="Pagos del mes"
              value={summary.data?.count ?? '…'}
              detail="Ver en el calendario de pagos"
            />
            <StatTile
              href="/calendario"
              label="Vencimientos por atender"
              value={alerts.data ? alerts.data.overdue + alerts.data.due_soon : '…'}
              detail={
                alerts.data &&
                (alerts.data.overdue > 0 ? (
                  <span className="text-destructive font-medium">
                    {alerts.data.overdue} {alerts.data.overdue === 1 ? 'vencido' : 'vencidos'}
                  </span>
                ) : (
                  'Ninguno vencido'
                ))
              }
            />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <DueDatesCard />
          <Card>
            <CardHeader>
              <CardTitle>Gasto por categoría</CardTitle>
              <CardDescription className="first-letter:uppercase">{formatMonth(today)}</CardDescription>
              <SectionLink to="/informes">Informes</SectionLink>
            </CardHeader>
            <CardContent>
              {summary.isPending ? (
                <LoadingRows rows={4} />
              ) : summary.data?.by_category.length ? (
                <BarList items={summary.data.by_category} />
              ) : (
                <p className="text-muted-foreground text-sm">Todavía no hay pagos este mes.</p>
              )}
            </CardContent>
          </Card>
          <BudgetsCard month={month} />
          <RecentPayments />
        </div>
      </div>
    </>
  )
}
