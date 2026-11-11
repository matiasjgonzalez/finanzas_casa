import { ChartColumn, ChartPie, ChevronDown, ChevronLeft, ChevronRight, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ScopeTabs } from '@/components/ScopeTabs'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { SectionCard } from '@/components/SectionCard'
import { Button } from '@/components/ui/button'
import type { MonthTotal, Spending, SpendingNode } from '@/features/reports/api'
import { StackedColumns } from '@/features/reports/StackedColumns'
import { useMonthly, useSpending } from '@/features/reports/useReports'
import { addMonths, formatMonth, monthKey, parseMonth } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { type Scope, SCOPE_PARAM, scopeParam, useScope } from '@/lib/scope'
import { cn } from '@/lib/utils'

type Period = 'mes' | 'anio'

/** Mes o año elegido, en la URL (?periodo=anio&anio=2026 o ?mes=2026-10): se puede compartir. */
function usePeriod() {
  const [params, setParams] = useSearchParams()
  // Al cambiar de mes o de año se queda en la misma pestaña (Mis gastos / Gastos del hogar).
  const vista = params.get(SCOPE_PARAM)
  const show = (next: Record<string, string>) =>
    setParams(vista ? { ...next, [SCOPE_PARAM]: vista } : next, { replace: true })
  const today = new Date()
  const period: Period = params.get('periodo') === 'anio' ? 'anio' : 'mes'
  const month = parseMonth(params.get('mes'))
  const yearParam = Number(params.get('anio'))
  const year = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : today.getFullYear()
  return {
    period,
    month,
    year,
    showMonth: (target: Date) => show({ mes: monthKey(target) }),
    showYear: (target: number) => show({ periodo: 'anio', anio: String(target) }),
    showScope: (scope: Scope) => {
      const next = new URLSearchParams(params)
      if (scope === 'household') next.set(SCOPE_PARAM, scopeParam(scope))
      else next.delete(SCOPE_PARAM)
      setParams(next, { replace: true })
    },
  }
}

const shortMonth = new Intl.DateTimeFormat('es-AR', { month: 'short' })
const longMonth = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })
const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00`)

function percent(part: number, whole: number): string {
  if (whole <= 0) return '0 %'
  const value = (part / whole) * 100
  return value > 0 && value < 1 ? '< 1 %' : `${Math.round(value)} %`
}

/** Gasto del mes o del año: total, mes a mes y en qué se gastó, con todo el detalle. */
export function SpendingPage() {
  const { period, month, year, showMonth, showYear, showScope } = usePeriod()
  const scope = useScope()
  const query = period === 'anio' ? { year } : { month: monthKey(month) }
  const { data, error, isPending, isPlaceholderData, refetch } = useSpending(query, scope)

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={scope === 'household' ? 'Cuánto gastó el hogar' : 'Cuánto gasté'}
        description={
          scope === 'household'
            ? 'Lo que cargaron todos los integrantes, por mes o por año.'
            : 'Lo que cargaste vos y en qué, por mes o por año.'
        }
      />
      <ScopeTabs scope={scope} onChange={showScope} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-muted inline-flex rounded-xl p-1" role="group" aria-label="Ver por">
          {(
            [
              ['mes', 'Por mes'],
              ['anio', 'Por año'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => (value === 'anio' ? showYear(month.getFullYear()) : showMonth(new Date(year, 0, 1)))}
              className={cn(
                'focus-visible:ring-ring/50 rounded-lg px-4 py-2 text-base font-medium outline-none focus-visible:ring-3',
                period === value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={period === 'anio' ? 'Año anterior' : 'Mes anterior'}
            onClick={() => (period === 'anio' ? showYear(year - 1) : showMonth(addMonths(month, -1)))}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center text-lg font-semibold first-letter:uppercase" aria-live="polite">
            {period === 'anio' ? year : formatMonth(month)}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={period === 'anio' ? 'Año siguiente' : 'Mes siguiente'}
            onClick={() => (period === 'anio' ? showYear(year + 1) : showMonth(addMonths(month, 1)))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {isPending ? (
        <LoadingRows rows={5} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : (
        <div className={cn('flex flex-col gap-6 transition-opacity', isPlaceholderData && 'opacity-60')}>
          <Headline data={data} scope={scope} />
          <MonthByMonth data={data} />
          <Detail data={data} />
        </div>
      )}
    </div>
  )
}

/** El total como una frase, con la comparación (y el promedio por mes en la vista anual). */
function Headline({ data, scope }: { data: Spending; scope: Scope }) {
  const start = asDate(data.start)
  const isYear = data.period === 'year'
  const total = Number(data.total)
  const previous = Number(data.previous_total)
  const label = isYear ? `En ${start.getFullYear()}` : `En ${formatMonth(start)}`
  const previousLabel = isYear ? `en ${start.getFullYear() - 1}` : 'el mes anterior'
  const diff = total - previous
  // Promedio por mes: en el año en curso, sobre los meses que ya pasaron (incluido el actual).
  const now = new Date()
  const monthsSoFar = isYear && start.getFullYear() === now.getFullYear() ? now.getMonth() + 1 : 12

  return (
    <section aria-label="Total" className="flex flex-col gap-1">
      <p className="text-muted-foreground text-lg">
        {label} {scope === 'household' ? 'el hogar gastó' : 'gastaste'}
      </p>
      <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{formatMoney(data.total)}</p>
      <p className="text-muted-foreground mt-1 text-base">
        {data.count === 0
          ? 'No hay pagos cargados.'
          : `En ${data.count} ${data.count === 1 ? 'pago' : 'pagos'}.`}
        {previous > 0 &&
          (diff === 0
            ? ` Lo mismo que ${previousLabel}.`
            : ` ${formatMoney(Math.abs(diff))} ${diff > 0 ? 'más' : 'menos'} que ${previousLabel} (${formatMoney(previous)}).`)}
        {isYear && total > 0 && ` Promedio por mes: ${formatMoney(total / monthsSoFar)}.`}
      </p>
    </section>
  )
}

/** Los 12 meses en columnas, de todo o de una sola categoría. */
function MonthByMonth({ data }: { data: Spending }) {
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const scope = useScope()
  const start = asDate(data.start)
  const isYear = data.period === 'year'
  const until = isYear ? `${start.getFullYear()}-12` : monthKey(start)
  const chosen = data.categories.find((c) => c.id === categoryId) ?? null
  // Solo hace falta pedirlo al elegir una categoría: el total ya viene con `data`.
  const filtered = useMonthly({ until, months: 12, category_id: chosen?.id ?? undefined, scope }, !!chosen)
  const months: MonthTotal[] | undefined = chosen ? filtered.data : data.months

  // La columna destacada: el mes elegido; en la vista anual, el mes actual (si es este año).
  const now = new Date()
  const thisYear = isYear && start.getFullYear() === now.getFullYear()
  const initial = isYear ? (thisYear ? now.getMonth() : 11) : 11
  const emphasis = isYear ? (thisYear ? now.getMonth() : undefined) : 11

  return (
    <SectionCard
      icon={ChartColumn}
      title={isYear ? `Mes a mes en ${start.getFullYear()}` : 'Los últimos 12 meses'}
      description={chosen ? `Solo ${chosen.name}.` : 'Todo lo que se gastó.'}
    >
      <div className="flex flex-col gap-4">
        {data.categories.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar">
            {[{ id: null, name: 'Todo' }, ...data.categories].map((c) => (
              <Button
                key={c.id ?? 'todo'}
                size="sm"
                variant={categoryId === c.id ? 'default' : 'outline'}
                aria-pressed={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>
        )}
        {!months ? (
          <LoadingRows rows={3} />
        ) : (
          <StackedColumns
            key={`${until}-${categoryId}`}
            initial={initial}
            emphasis={emphasis}
            series={[{ key: 'total', label: chosen?.name ?? 'Gastado', color: 'var(--brand)' }]}
            rows={months.map((m) => ({
              key: m.month,
              label: longMonth.format(asDate(m.month)),
              short: shortMonth.format(asDate(m.month)).replace('.', ''),
              values: { total: Number(m.total) },
            }))}
          />
        )}
      </div>
    </SectionCard>
  )
}

/** En qué se gastó: cada categoría con su detalle (tipos, o elementos y sus tipos). */
function Detail({ data }: { data: Spending }) {
  const total = Number(data.total)
  return (
    <SectionCard
      icon={ChartPie}
      title="En qué se gastó"
      description="Tocá una categoría para ocultar o ver su detalle."
      footer={{ to: '/pagos', label: 'Ver todos los pagos', icon: ReceiptText }}
    >
      {data.categories.length === 0 ? (
        <EmptyState
          icon={ChartPie}
          title={data.period === 'year' ? 'No hay pagos este año' : 'No hay pagos este mes'}
          action={{ to: '/pagos/nuevo', label: 'Cargar un pago' }}
        />
      ) : (
        <ul className="flex flex-col gap-5" aria-label="Gasto por categoría">
          {data.categories.map((category) => (
            <CategoryRow key={category.id} node={category} total={total} />
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function CategoryRow({ node, total }: { node: SpendingNode; total: number }) {
  const [open, setOpen] = useState(true)
  const hasDetail = node.children.length > 0
  const row = <Line node={node} whole={total} level={0} />
  return (
    <li>
      {hasDetail ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="hover:bg-accent focus-visible:ring-ring/50 -mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-1 text-left outline-none focus-visible:ring-3"
        >
          <ChevronDown
            className={cn('text-muted-foreground mt-1 size-4 shrink-0 transition-transform', !open && '-rotate-90')}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">{row}</span>
        </button>
      ) : (
        <div className="flex gap-2 py-1">
          <span className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{row}</span>
        </div>
      )}
      {hasDetail && open && <Children nodes={node.children} parent={node} level={1} />}
    </li>
  )
}

/** Los renglones de adentro (ej. Gas y Luz dentro de Servicio), con sangría. La barra mide su
 * parte de la categoría: coincide con el porcentaje que se lee al lado. */
function Children({ nodes, parent, level }: { nodes: SpendingNode[]; parent: SpendingNode; level: number }) {
  return (
    <ul
      className={cn('border-border mt-2 flex flex-col gap-3 border-l pl-4', level === 1 ? 'ml-[1.6rem]' : 'ml-1')}
      aria-label={`Detalle de ${parent.name}`}
    >
      {nodes.map((n) => (
        <li key={n.id ?? n.name}>
          <Line node={n} whole={Number(parent.total)} level={level} />
          {n.children.length > 0 && <Children nodes={n.children} parent={n} level={level + 1} />}
        </li>
      ))}
    </ul>
  )
}

/** Nombre, monto, porcentaje (de su categoría, o del total) y una barra del mismo largo. */
function Line({ node, whole, level }: { node: SpendingNode; whole: number; level: number }) {
  const value = Number(node.total)
  const width = whole > 0 ? Math.max((value / whole) * 100, 1) : 0
  return (
    <div className="flex flex-col gap-1.5">
      {/* Si el nombre no entra junto al monto (en el celular), el monto baja a la línea de abajo:
          el nombre nunca se corta. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span
          className={cn(
            level === 0 ? 'text-base font-semibold' : 'text-sm',
            node.id === null && 'text-muted-foreground',
          )}
        >
          {node.name}
        </span>
        <span className={cn('ml-auto shrink-0 tabular-nums', level === 0 ? 'text-base font-semibold' : 'text-sm')}>
          {formatMoney(node.total)}
          <span className="text-muted-foreground ml-2 text-xs font-normal">{percent(value, whole)}</span>
        </span>
      </div>
      <div className={cn('bg-muted overflow-hidden rounded-full', level === 0 ? 'h-2.5' : 'h-1.5')} aria-hidden="true">
        <div
          className={cn('h-full rounded-full', level === 0 ? 'bg-brand' : 'bg-brand/70')}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}
