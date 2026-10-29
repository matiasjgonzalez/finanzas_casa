import { CircleAlert, CircleCheck, Clock } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { type Category, usesItems, usesTypes } from '@/features/catalog/api'
import { useCategories } from '@/features/catalog/useCatalog'
import type { MonthGroups, MonthTotal } from '@/features/reports/api'
import { LineChart } from '@/features/reports/LineChart'
import { type Panel, SmallMultiples } from '@/features/reports/SmallMultiples'
import { type ColumnRow, type Series, StackedColumns } from '@/features/reports/StackedColumns'
import {
  useBudgetHistory,
  useDaily,
  useMonthly,
  useMonthlyGrouped,
  usePatterns,
  useProjection,
  usePunctuality,
} from '@/features/reports/useReports'
import { MonthNav } from '@/features/services/MonthCalendar'
import { useCalendarMonth } from '@/features/services/useCalendarMonth'
import { addMonths, monthKey } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const short = new Intl.DateTimeFormat('es-AR', { month: 'short' })
const long = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })
const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00`)

const monthRow = (month: string, values: Record<string, number>): ColumnRow => ({
  key: month,
  label: long.format(asDate(month)),
  short: short.format(asDate(month)).replace('.', ''),
  values,
})

/** Un solo valor por mes (una serie, en el color de la marca). */
function singleSeries(months: MonthTotal[], label: string) {
  return {
    series: [{ key: 'total', label, color: 'var(--brand)' }] satisfies Series[],
    rows: trimStart(months, (m) => Number(m.total)).map((m) => monthRow(m.month, { total: Number(m.total) })),
  }
}

/** Desde el primer mes con pagos (mínimo los últimos 3): los meses vacíos del principio
 * solo ocupan lugar. */
function trimStart<T>(months: T[], total: (m: T) => number): T[] {
  const first = months.findIndex((m) => total(m) > 0)
  if (first < 0) return months.slice(-3)
  return months.slice(Math.min(first, Math.max(months.length - 3, 0)))
}

/** Un panel por grupo (categoría, tipo o elemento), ordenados por el total del período. */
function panelsOf(months: MonthGroups[]): Panel[] {
  const panels = new Map<string, Panel & { total: number }>()
  months.forEach((m, i) => {
    for (const g of m.groups) {
      const key = g.id ?? g.name
      const panel = panels.get(key) ?? { key, name: g.name, values: months.map(() => 0), total: 0 }
      panel.values[i] += Number(g.total)
      panel.total += Number(g.total)
      panels.set(key, panel)
    }
  })
  return [...panels.values()].sort((x, y) => y.total - x.total)
}

// --- Evolución -----------------------------------------------------------------------------

function BudgetHistory({ category }: { category: Category }) {
  const { data, isPending } = useBudgetHistory(category.id)
  if (isPending) return <LoadingRows rows={3} />
  if (!data?.some((m) => m.budget)) {
    return (
      <p className="text-muted-foreground text-sm">
        «{category.name}» no tiene presupuesto. Se fija en{' '}
        <Link to="/presupuestos" className="underline underline-offset-2">
          Presupuestos
        </Link>
        .
      </p>
    )
  }
  return (
    <StackedColumns
      rows={data.map((m) => monthRow(m.month, { spent: Number(m.spent) }))}
      series={[{ key: 'spent', label: 'Gastado', color: 'var(--brand)' }]}
      reference={{ label: 'Presupuesto', values: data.map((m) => (m.budget ? Number(m.budget) : null)) }}
    />
  )
}

export function EvolutionView() {
  const categories = useCategories()
  const [categoryId, setCategoryId] = useState('')
  const [split, setSplit] = useState<'type' | 'item'>('type')
  const [typeId, setTypeId] = useState('')
  const [itemId, setItemId] = useState('')
  const category = categories.data?.find((c) => c.id === categoryId)
  const until = monthKey(new Date())
  const singleFilter = !!(typeId || itemId)

  const grouped = useMonthlyGrouped({
    group: category ? (usesItems(category) ? split : 'type') : 'category',
    until,
    months: 12,
    category_id: categoryId || undefined,
  })
  const single = useMonthly({
    until,
    months: 12,
    category_id: categoryId || undefined,
    category_type_id: typeId || undefined,
    item_id: itemId || undefined,
  })
  const chooseCategory = (id: string) => {
    setCategoryId(id)
    setTypeId('')
    setItemId('')
    setSplit('item')
  }
  const query = singleFilter ? single : grouped
  const singleName = [category?.items.find((i) => i.id === itemId)?.name, category?.types.find((t) => t.id === typeId)?.name]
    .filter(Boolean)
    .join(' · ')
  const groupedMonths = grouped.data ? trimStart(grouped.data, (m) => Number(m.total)) : null
  const chart =
    singleFilter && single.data
      ? singleSeries(single.data, singleName)
      : !singleFilter && groupedMonths
        ? singleSeries(
            groupedMonths.map((m) => ({ month: m.month, total: m.total, count: 0 })),
            category?.name ?? 'Total',
          )
        : null
  // Desglose: un mini gráfico por grupo (solo si hay más de uno para comparar).
  const panels = !singleFilter && groupedMonths && (!category || usesTypes(category)) ? panelsOf(groupedMonths) : []

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Evolución mensual</CardTitle>
          <CardDescription>
            Total de cada mes (hasta 12 meses). Debajo, el desglose para ver qué hizo subir o bajar cada mes.
            Pasá el mouse sobre una barra para ver el detalle.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="evolucion-categoria" className="text-xs">
                Categoría
              </Label>
              <NativeSelect
                id="evolucion-categoria"
                className="[&_select]:h-8"
                value={categoryId}
                onChange={(e) => chooseCategory(e.target.value)}
              >
                <NativeSelectOption value="">Todas</NativeSelectOption>
                {categories.data?.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            {category && usesItems(category) && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="evolucion-elemento" className="text-xs">
                  {category.item_label ?? 'Elemento'}
                </Label>
                <NativeSelect
                  id="evolucion-elemento"
                  className="[&_select]:h-8"
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                >
                  <NativeSelectOption value="">Todos</NativeSelectOption>
                  {category.items.map((i) => (
                    <NativeSelectOption key={i.id} value={i.id}>
                      {i.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            {category && usesTypes(category) && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="evolucion-tipo" className="text-xs">
                  Tipo
                </Label>
                <NativeSelect
                  id="evolucion-tipo"
                  className="[&_select]:h-8"
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                >
                  <NativeSelectOption value="">Todos</NativeSelectOption>
                  {category.types.map((t) => (
                    <NativeSelectOption key={t.id} value={t.id}>
                      {t.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            {category && usesItems(category) && !singleFilter && (
              <div className="flex gap-1" role="group" aria-label="Desglosar por">
                {(['item', 'type'] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={split === value ? 'default' : 'outline'}
                    aria-pressed={split === value}
                    onClick={() => setSplit(value)}
                  >
                    Por {value === 'item' ? (category.item_label ?? 'elemento').toLowerCase() : 'tipo'}
                  </Button>
                ))}
              </div>
            )}
          </div>
          {query.error ? (
            <ErrorMessage error={query.error} onRetry={() => query.refetch()} />
          ) : !chart ? (
            <LoadingRows rows={4} />
          ) : (
            <StackedColumns rows={chart.rows} series={chart.series} />
          )}
        </CardContent>
      </Card>
      {panels.length > 1 && groupedMonths && (
        <Card>
          <CardHeader>
            <CardTitle>
              {category
                ? `${category.name} por ${usesItems(category) && split === 'item' ? (category.item_label ?? 'elemento').toLowerCase() : 'tipo'}`
                : 'Por categoría'}
            </CardTitle>
            <CardDescription>
              Todos con la misma escala, para compararlos. La flecha indica cuánto subió o bajó el último mes
              respecto del anterior.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SmallMultiples
              panels={panels}
              months={groupedMonths.map((m) => ({
                long: long.format(asDate(m.month)),
                short: short.format(asDate(m.month)).replace('.', ''),
              }))}
            />
          </CardContent>
        </Card>
      )}
      {category && (
        <Card>
          <CardHeader>
            <CardTitle>Presupuesto contra gastado: {category.name}</CardTitle>
            <CardDescription>
              La línea punteada es el límite de cada mes: muestra si la categoría vive pasada o fue un mes
              puntual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetHistory category={category} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// --- Este mes ------------------------------------------------------------------------------

/** Suma acumulada día a día: cuánto se llevaba gastado al final de cada día. */
function cumulative(days: { date: string; total: string }[], length: number, until: number): (number | null)[] {
  const byDay = new Map(days.map((d) => [Number(d.date.slice(8, 10)), Number(d.total)]))
  let running = 0
  return Array.from({ length }, (_, i) => {
    if (i + 1 > until) return null
    running += byDay.get(i + 1) ?? 0
    return running
  })
}

export function MonthView() {
  const { month, key, goTo } = useCalendarMonth()
  const previousKey = monthKey(addMonths(month, -1))
  const current = useDaily(key)
  const previous = useDaily(previousKey)
  const projection = useProjection(key)
  const today = new Date()
  const isCurrent = key === monthKey(today)
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const previousDays = new Date(month.getFullYear(), month.getMonth(), 0).getDate()
  const length = Math.max(days, previousDays)
  const isFuture = month > today
  const lastDay = isFuture ? 0 : isCurrent ? today.getDate() : days
  const p = projection.data

  return (
    <div className="flex flex-col gap-4">
      <MonthNav month={month} goTo={goTo} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-card flex flex-col gap-1 rounded-xl border p-4">
          <span className="text-muted-foreground text-sm">Gastado</span>
          <span className="text-2xl font-semibold tabular-nums">{p ? formatMoney(p.spent) : '…'}</span>
        </div>
        <div className="bg-card flex flex-col gap-1 rounded-xl border p-4">
          <span className="text-muted-foreground text-sm">Vencimientos que faltan pagar</span>
          <span className="text-2xl font-semibold tabular-nums">{p ? formatMoney(p.pending) : '…'}</span>
          {p && (
            <span className="text-muted-foreground text-xs">
              {p.pending_count} {p.pending_count === 1 ? 'vencimiento' : 'vencimientos'}
              {p.unknown_count > 0 && ` + ${p.unknown_count} de importe a definir`}
            </span>
          )}
        </div>
        <div className="bg-card border-brand/60 flex flex-col gap-1 rounded-xl border p-4">
          <span className="text-muted-foreground text-sm">Proyección a fin de mes</span>
          <span className="text-2xl font-semibold tabular-nums">{p ? formatMoney(p.projected) : '…'}</span>
          <span className="text-muted-foreground text-xs">Lo gastado más lo que falta vencer</span>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Gasto acumulado del mes</CardTitle>
          <CardDescription>
            Cuánto se llevaba gastado cada día, contra el mes anterior al mismo día: así se compara el ritmo
            aunque el mes no haya terminado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {current.isPending || previous.isPending ? (
            <LoadingRows rows={4} />
          ) : current.error ? (
            <ErrorMessage error={current.error} onRetry={() => current.refetch()} />
          ) : (
            <LineChart
              labels={Array.from({ length }, (_, i) => String(i + 1))}
              xLabel={(i) => `Día ${i + 1}`}
              // Se empieza mostrando hoy (o el último día, en meses pasados).
              initial={lastDay > 0 ? lastDay - 1 : undefined}
              lines={[
                {
                  key: 'previous',
                  label: long.format(addMonths(month, -1)),
                  color: 'var(--muted-foreground)',
                  dashed: true,
                  values: cumulative(previous.data ?? [], length, previousDays),
                },
                {
                  key: 'current',
                  label: long.format(month),
                  color: 'var(--brand)',
                  values: cumulative(current.data ?? [], length, lastDay),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// --- Vencimientos --------------------------------------------------------------------------

const STATUS_SERIES: Series[] = [
  {
    key: 'on_time',
    label: 'A tiempo',
    color: 'var(--positive)',
    icon: <CircleCheck className="text-positive size-3.5" aria-hidden="true" />,
  },
  { key: 'late', label: 'Tarde', color: 'var(--warning)', icon: <Clock className="text-warning size-3.5" aria-hidden="true" /> },
  {
    key: 'overdue',
    label: 'Vencido sin pagar',
    color: 'var(--destructive)',
    icon: <CircleAlert className="text-destructive size-3.5" aria-hidden="true" />,
  },
]

export function DueDatesView() {
  const [months, setMonths] = useState(6)
  const { data, error, isPending, refetch } = usePunctuality(months)
  const count = (n: number) => `${n} ${n === 1 ? 'vencimiento' : 'vencimientos'}`

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Puntualidad de los vencimientos</CardTitle>
          <CardDescription>
            Cuántos se pagaron a tiempo, tarde (pueden tener recargo) o siguen vencidos. Los que todavía no
            vencieron no cuentan.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-1" role="group" aria-label="Período">
            {[3, 6, 12].map((n) => (
              <Button key={n} size="sm" variant={months === n ? 'default' : 'outline'} aria-pressed={months === n} onClick={() => setMonths(n)}>
                Últimos {n} meses
              </Button>
            ))}
          </div>
          {isPending ? (
            <LoadingRows rows={4} />
          ) : error ? (
            <ErrorMessage error={error} onRetry={() => refetch()} />
          ) : (
            <StackedColumns
              format={count}
              series={STATUS_SERIES}
              rows={data.months.map((m) =>
                monthRow(m.month, { on_time: m.on_time, late: m.late, overdue: m.overdue }),
              )}
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Por vencimiento</CardTitle>
          <CardDescription>Primero los que más se atrasan.</CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.services.length ? (
            <p className="text-muted-foreground text-sm">No hubo vencimientos en el período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimiento</TableHead>
                  {STATUS_SERIES.map((s) => (
                    <TableHead key={s.key} className="text-right">
                      <span className="inline-flex items-center gap-1">
                        {s.icon}
                        {s.label}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.services.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link to={`/calendario/servicios/${s.id}`} className="hover:underline">
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.on_time || '—'}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', s.late > 0 && 'text-warning font-medium')}>
                      {s.late || '—'}
                    </TableCell>
                    <TableCell
                      className={cn('text-right tabular-nums', s.overdue > 0 && 'text-destructive font-medium')}
                    >
                      {s.overdue || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// --- Patrones (en Resumen) -----------------------------------------------------------------

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export function PatternsCard({ from, to }: { from?: string; to?: string }) {
  const [by, setBy] = useState<'weekday' | 'monthday'>('weekday')
  const { data, isPending } = usePatterns({ date_from: from, date_to: to })
  const slots = by === 'weekday' ? data?.weekdays : data?.month_days
  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Cuándo se gasta?</CardTitle>
        <CardDescription>En qué días se concentra el gasto del período.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-1" role="group" aria-label="Agrupar por">
          <Button size="sm" variant={by === 'weekday' ? 'default' : 'outline'} aria-pressed={by === 'weekday'} onClick={() => setBy('weekday')}>
            Día de la semana
          </Button>
          <Button size="sm" variant={by === 'monthday' ? 'default' : 'outline'} aria-pressed={by === 'monthday'} onClick={() => setBy('monthday')}>
            Día del mes
          </Button>
        </div>
        {isPending || !slots ? (
          <LoadingRows rows={3} />
        ) : (
          <StackedColumns
            key={by}
            height="h-36"
            initial={slots.reduce((best, s, i) => (Number(s.total) > Number(slots[best].total) ? i : best), 0)}
            series={[{ key: 'total', label: 'Gastado', color: 'var(--brand)' }]}
            rows={slots.map((s) => ({
              key: String(s.slot),
              label:
                by === 'weekday'
                  ? `${WEEKDAYS[s.slot - 1]} (${s.count} ${s.count === 1 ? 'pago' : 'pagos'})`
                  : `Día ${s.slot} (${s.count} ${s.count === 1 ? 'pago' : 'pagos'})`,
              short: by === 'weekday' ? WEEKDAYS[s.slot - 1].slice(0, 3) : s.slot % 5 === 0 || s.slot === 1 ? String(s.slot) : '',
              values: { total: Number(s.total) },
            }))}
          />
        )}
      </CardContent>
    </Card>
  )
}

/** Evolución de un vencimiento (ej. cuánto vino la luz cada mes), para su página de detalle. */
export function DueDateHistoryChart({ categoryId, typeId, itemId }: { categoryId: string; typeId?: string; itemId?: string }) {
  const { data, isPending } = useMonthly({
    until: monthKey(new Date()),
    months: 12,
    category_id: categoryId,
    category_type_id: typeId,
    item_id: itemId,
  })
  if (isPending || !data) return <LoadingRows rows={3} />
  const chart = singleSeries(data, 'Pagado')
  return <StackedColumns rows={chart.rows} series={chart.series} />
}

