import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ChartPie,
  PiggyBank,
  Plus,
  ReceiptText,
  Wallet,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { DateBlock } from '@/components/DateBlock'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { SectionCard } from '@/components/SectionCard'
import { useCurrentUser } from '@/features/auth/useAuth'
import { BarList, BudgetBar } from '@/features/reports/charts'
import { useBudgets, useProjection, useSummary } from '@/features/reports/useReports'
import { periodPath } from '@/features/services/api'
import { PeriodStatusBadge } from '@/features/services/PeriodStatusBadge'
import { useAlerts } from '@/features/services/useServices'
import { paymentSubtitle, paymentTitle } from '@/features/transactions/types'
import { useTransactionList } from '@/features/transactions/useTransactions'
import { formatMonth, monthKey } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Diferencia con el mes anterior: más gasto es "peor", por eso sube en rojo y baja en verde. */
function Change({ current, previous }: { current: string; previous: string }) {
  const now = Number(current)
  const before = Number(previous)
  if (before === 0) return <>Sin pagos el mes anterior</>
  const diff = ((now - before) / before) * 100
  const up = diff > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span>
      <span className={cn('inline-flex items-center font-medium', up ? 'text-destructive' : 'text-positive')}>
        <Icon className="size-3.5" aria-hidden="true" />
        {up ? 'más' : 'menos'} {Math.abs(Math.round(diff))} %
      </span>{' '}
      que el mes anterior ({formatMoney(previous)})
    </span>
  )
}

/** Fila de lista: fecha en bloque, título con detalle y algo a la derecha (importe, estado). */
function Row({ to, date, title, detail, children }: { to: string; date: string; title: string; detail: string; children: ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-4 px-5 py-3.5 outline-none focus-visible:ring-3 sm:px-6"
      >
        <DateBlock iso={date} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="text-muted-foreground block truncate text-xs">{detail}</span>
        </span>
        {children}
      </Link>
    </li>
  )
}

function DueDatesCard() {
  const { isAdmin } = useCurrentUser()
  const { data, error, isPending, refetch } = useAlerts(7)
  return (
    <SectionCard
      icon={CalendarClock}
      title="Próximos vencimientos"
      description="Vencidos y los de los próximos 7 días"
      footer={{ to: '/calendario', label: 'Ver calendario', icon: CalendarDays }}
      flush
    >
      {isPending ? (
        <div className="p-6">
          <LoadingRows rows={3} />
        </div>
      ) : error ? (
        <div className="p-6">
          <ErrorMessage error={error} onRetry={() => refetch()} />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No tenés vencimientos esta semana"
          description="Cuando se acerque uno, va a aparecer acá y en la campana de arriba."
          action={isAdmin ? { to: '/administracion/categorias', label: 'Programar vencimientos', icon: Plus } : undefined}
        />
      ) : (
        <ul className="divide-y">
          {data.items.slice(0, 5).map((p) => (
            <Row key={p.id} to={`/calendario/vencimientos/${p.id}`} date={p.due_date} title={p.service.name} detail={periodPath(p)}>
              <span className="hidden text-sm whitespace-nowrap tabular-nums sm:inline">
                {p.amount_due ? formatMoney(p.amount_due, p.currency) : 'A definir'}
              </span>
              <PeriodStatusBadge status={p.status} />
            </Row>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function MonthCard({ month }: { month: string }) {
  const summary = useSummary(month)
  const projection = useProjection(month)
  const s = summary.data
  const p = projection.data
  return (
    <SectionCard
      icon={Wallet}
      title="Este mes"
      description={<span className="first-letter:uppercase">{formatMonth(new Date())}</span>}
      footer={{ to: '/informes?vista=mes', label: 'Ver el mes en detalle', icon: ChartColumn }}
    >
      {summary.error ? (
        <ErrorMessage error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <dl className="flex flex-col gap-5">
          <div>
            <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Gastado</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{s ? formatMoney(s.total) : '…'}</dd>
            {s && (
              <dd className="text-muted-foreground mt-1 text-xs">
                <Change current={s.total} previous={s.previous_total} />
              </dd>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div>
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Proyección</dt>
              <dd className="mt-1 font-semibold tabular-nums">{p ? formatMoney(p.projected) : '…'}</dd>
              <dd className="text-muted-foreground text-xs">a fin de mes</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Pagos</dt>
              <dd className="mt-1 font-semibold tabular-nums">{s?.count ?? '…'}</dd>
              <dd className="text-muted-foreground text-xs">cargados</dd>
            </div>
          </div>
        </dl>
      )}
    </SectionCard>
  )
}

function BudgetsCard({ month }: { month: string }) {
  const { isAdmin } = useCurrentUser()
  const { data, isPending } = useBudgets(month)
  // Primero los superados, después los que están cerca del límite.
  const order = { exceeded: 0, warning: 1, ok: 2 }
  const items = [...(data ?? [])].sort((a, b) => order[a.status] - order[b.status]).slice(0, 3)
  return (
    <SectionCard icon={PiggyBank} title="Presupuestos" footer={{ to: '/presupuestos', label: 'Ver presupuestos', icon: PiggyBank }}>
      {isPending ? (
        <LoadingRows rows={2} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="Sin presupuestos"
          description={isAdmin ? 'Fijá un límite mensual por categoría.' : 'Los fija un administrador del hogar.'}
          action={isAdmin ? { to: '/presupuestos', label: 'Fijar un presupuesto', icon: Plus } : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-5">
          {items.map((b) => (
            <li key={b.category.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{b.category.name}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatMoney(b.spent)} de {formatMoney(b.amount)}
                </span>
              </div>
              <BudgetBar spent={b.spent} amount={b.amount} status={b.status} />
            </li>
          ))}
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
      title="Últimos pagos"
      footer={{ to: '/pagos', label: 'Ver todos los pagos', icon: ReceiptText }}
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
          action={{ to: '/pagos/nuevo', label: 'Cargar un pago', icon: Plus }}
        />
      ) : (
        <ul className="divide-y">
          {data.items.map((t) => (
            <Row
              key={t.id}
              to={`/pagos/${t.id}`}
              date={t.occurred_on}
              title={paymentTitle(t)}
              detail={[t.created_by.full_name, paymentSubtitle(t)].filter(Boolean).join(' · ')}
            >
              <span className="text-sm font-medium whitespace-nowrap tabular-nums">{formatMoney(t.amount, t.currency)}</span>
            </Row>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function CategoriesCard({ month }: { month: string }) {
  const summary = useSummary(month)
  return (
    <SectionCard icon={ChartPie} title="Gasto por categoría" footer={{ to: '/informes', label: 'Ver informes', icon: ChartColumn }}>
      {summary.isPending ? (
        <LoadingRows rows={4} />
      ) : summary.data?.by_category.length ? (
        <BarList items={summary.data.by_category.slice(0, 5)} />
      ) : (
        <EmptyState icon={ChartPie} title="Todavía no hay pagos este mes" />
      )}
    </SectionCard>
  )
}

export function HomePage() {
  const month = monthKey(new Date())
  return (
    <>
      <PageHeader title="Inicio" description="Lo importante del hogar, de un vistazo." />
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <DueDatesCard />
          <MonthCard month={month} />
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <BudgetsCard month={month} />
          <RecentPayments />
          <CategoriesCard month={month} />
        </div>
      </div>
    </>
  )
}
