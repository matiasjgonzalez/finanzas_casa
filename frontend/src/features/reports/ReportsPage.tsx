import { useQueries } from '@tanstack/react-query'
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CalendarRange,
  ChartBar,
  ChartColumn,
  Columns3,
  Download,
  Plus,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { plural, usesItems, usesTypes } from '@/features/catalog/api'
import { useCategories } from '@/features/catalog/useCatalog'
import { exportUrl, getBreakdown, type GroupTotal } from '@/features/reports/api'
import { BarList } from '@/features/reports/charts'
import { useBreakdown } from '@/features/reports/useReports'
import { DueDatesView, EvolutionView, MonthView, PatternsCard } from '@/features/reports/views'
import { addMonths, monthKey, PERIOD_LABELS, type PeriodPreset, periodRange, toISODate } from '@/lib/dates'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const PRESETS = Object.keys(PERIOD_LABELS) as PeriodPreset[]

function sum(items: GroupTotal[] = []): number {
  return items.reduce((total, i) => total + Number(i.total), 0)
}

/** Período elegido, guardado en la URL (?periodo=… o ?desde=…&hasta=…). */
function usePeriod() {
  const [params, setParams] = useSearchParams()
  // Cambia solo el período: la vista elegida y los meses a comparar se mantienen.
  const update = (values: Record<string, string>) =>
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        for (const key of ['periodo', 'desde', 'hasta']) copy.delete(key)
        for (const [key, value] of Object.entries(values)) if (value) copy.set(key, value)
        return copy
      },
      { replace: true },
    )
  const preset = (params.get('periodo') as PeriodPreset | null) ?? (params.get('desde') ? null : 'this-month')
  const range = preset ? periodRange(preset) : { from: params.get('desde') ?? undefined, to: params.get('hasta') ?? undefined }
  return {
    preset,
    from: range.from,
    to: range.to,
    choose: (p: PeriodPreset) => update({ periodo: p }),
    custom: (from: string, to: string) => update({ desde: from, hasta: to }),
  }
}

function PeriodPicker({ period }: { period: ReturnType<typeof usePeriod> }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Período">
        {PRESETS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={period.preset === p ? 'default' : 'outline'}
            aria-pressed={period.preset === p}
            onClick={() => period.choose(p)}
          >
            {PERIOD_LABELS[p]}
          </Button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="informe-desde" className="text-xs">
            Desde
          </Label>
          <Input
            id="informe-desde"
            type="date"
            className="h-8"
            value={period.from ?? ''}
            onChange={(e) => period.custom(e.target.value, period.to ?? '')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="informe-hasta" className="text-xs">
            Hasta
          </Label>
          <Input
            id="informe-hasta"
            type="date"
            className="h-8"
            value={period.to ?? ''}
            onChange={(e) => period.custom(period.from ?? '', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

/** Detalle de una categoría: por tipo y, si tiene, por elemento (ej. cada auto). */
function CategoryDetail({ categoryId, from, to }: { categoryId: string; from?: string; to?: string }) {
  const categories = useCategories(true)
  const category = categories.data?.find((c) => c.id === categoryId)
  const range = { date_from: from, date_to: to, category_id: categoryId }
  const byType = useBreakdown({ group: 'type', ...range }, !!category && usesTypes(category))
  const byItem = useBreakdown({ group: 'item', ...range }, !!category && usesItems(category))
  if (!category) return null
  if (!usesTypes(category)) {
    return <p className="text-muted-foreground text-sm">«{category.name}» no tiene tipos para detallar.</p>
  }
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {usesItems(category) && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Por {(category.item_label ?? 'elemento').toLowerCase()}</h3>
          {byItem.data ? <BarList items={byItem.data} /> : <LoadingRows rows={2} />}
        </div>
      )}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Por tipo</h3>
        {byType.data ? <BarList items={byType.data} /> : <LoadingRows rows={2} />}
      </div>
    </div>
  )
}

const MAX_COMPARE = 12
const monthLabel = (key: string) =>
  new Intl.DateTimeFormat('es-AR', { month: 'short', year: 'numeric' }).format(new Date(`${key}-01T12:00`))

function monthRange(key: string) {
  const [y, m] = key.split('-').map(Number)
  return { date_from: toISODate(new Date(y, m - 1, 1)), date_to: toISODate(new Date(y, m, 0)) }
}

/** Meses a comparar, en la URL (?meses=2026-08,2026-09,2026-10). Por defecto, los últimos 3. */
function useCompareMonths() {
  const [params, setParams] = useSearchParams()
  const now = new Date()
  const fallback = [-2, -1, 0].map((d) => monthKey(addMonths(now, d)))
  const months = (params.get('meses')?.split(',').filter((m) => /^\d{4}-\d{2}$/.test(m)) ?? fallback).sort()
  const save = (next: string[]) =>
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        copy.set('meses', [...new Set(next)].sort().join(','))
        return copy
      },
      { replace: true },
    )
  return {
    months: months.length ? months : fallback,
    add: (key: string) => key && save([...months, key].slice(-MAX_COMPARE)),
    remove: (key: string) => save(months.filter((m) => m !== key)),
    lastN: (n: number) => save(Array.from({ length: n }, (_, i) => monthKey(addMonths(now, i - n + 1)))),
  }
}

function Comparison() {
  const { months, add, remove, lastN } = useCompareMonths()
  const [newMonth, setNewMonth] = useState('')
  const results = useQueries({
    queries: months.map((key) => ({
      queryKey: ['transactions', 'reports', 'breakdown', { group: 'category', ...monthRange(key) }],
      queryFn: () => getBreakdown({ group: 'category', ...monthRange(key) }),
    })),
  })
  const loading = results.some((r) => r.isPending)
  const names = new Map<string, string>()
  for (const r of results) for (const item of r.data ?? []) names.set(item.id ?? item.name, item.name)
  const value = (index: number, id: string) =>
    Number(results[index]?.data?.find((i) => (i.id ?? i.name) === id)?.total ?? 0)
  const rows = [...names.entries()]
    .map(([id, name]) => ({ id, name, values: months.map((_, i) => value(i, id)) }))
    .sort((a, b) => sum2(b.values) - sum2(a.values))
  const totals = months.map((_, i) => sum(results[i]?.data))
  // Los meses sin ningún pago (ej. uno que todavía no llegó) no cuentan para el promedio ni
  // para la variación: si no, la distorsionarían.
  const withData = months.map((_, i) => i).filter((i) => totals[i] > 0)
  const first = withData[0]
  const last = withData[withData.length - 1]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparar meses</CardTitle>
        <CardDescription>
          Elegí los meses que quieras (hasta {MAX_COMPARE}). La variación compara el último mes con pagos
          con el primero; los meses sin pagos no cuentan para el promedio.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {months.map((key) => (
            <span key={key} className="bg-secondary inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm">
              <span className="first-letter:uppercase">{monthLabel(key)}</span>
              <button
                type="button"
                onClick={() => remove(key)}
                disabled={months.length <= 1}
                className="hover:bg-accent rounded-full p-0.5 disabled:opacity-40"
                aria-label={`Quitar ${monthLabel(key)}`}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              add(newMonth)
              setNewMonth('')
            }}
          >
            <Input
              type="month"
              aria-label="Mes a agregar"
              className="h-8 w-40"
              value={newMonth}
              onChange={(e) => setNewMonth(e.target.value)}
            />
            <Button type="submit" size="sm" variant="outline" disabled={!newMonth || months.length >= MAX_COMPARE}>
              <Plus aria-hidden="true" /> Agregar
            </Button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground mr-1 text-xs">Atajos:</span>
          {[3, 6, 12].map((n) => (
            <Button key={n} size="sm" variant="ghost" className="h-7" onClick={() => lastN(n)}>
              Últimos {n} meses
            </Button>
          ))}
        </div>

        {loading ? (
          <LoadingRows rows={4} />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay pagos en esos meses.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="bg-card sticky left-0">Categoría</TableHead>
                {months.map((key, i) => (
                  <TableHead key={key} className="text-right whitespace-nowrap first-letter:uppercase">
                    {monthLabel(key)}
                    {totals[i] === 0 && <span className="text-muted-foreground block text-xs font-normal">sin pagos</span>}
                  </TableHead>
                ))}
                {withData.length > 2 && <TableHead className="text-right">Promedio</TableHead>}
                {withData.length > 1 && <TableHead className="text-right">Variación</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...rows, { id: 'total', name: 'Total', values: totals }].map((r) => {
                const diff = withData.length > 1 ? r.values[last] - r.values[first] : 0
                const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight
                return (
                  <TableRow key={r.id} className={cn(r.id === 'total' && 'font-semibold')}>
                    <TableCell className="bg-card sticky left-0">{r.name}</TableCell>
                    {r.values.map((v, i) => (
                      <TableCell key={months[i]} className="text-right tabular-nums">
                        {v ? formatMoney(v) : '—'}
                      </TableCell>
                    ))}
                    {withData.length > 2 && (
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {formatMoney(sum2(withData.map((i) => r.values[i])) / withData.length)}
                      </TableCell>
                    )}
                    {withData.length > 1 && (
                      <TableCell
                        className={cn(
                          'text-right whitespace-nowrap tabular-nums',
                          diff > 0 && 'text-destructive',
                          diff < 0 && 'text-positive',
                        )}
                      >
                        {diff === 0 ? (
                          '—'
                        ) : (
                          <span className="inline-flex items-center gap-0.5">
                            <Icon className="size-3.5" aria-hidden="true" />
                            {formatMoney(Math.abs(diff))}
                            <span className="sr-only">{diff > 0 ? ' más' : ' menos'}</span>
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function sum2(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

function Summary() {
  const period = usePeriod()
  const range = { date_from: period.from, date_to: period.to }
  const byCategory = useBreakdown({ group: 'category', ...range })
  const byMember = useBreakdown({ group: 'member', ...range })
  const [selected, setSelected] = useState<string | null>(null)
  const categories = useCategories(true)
  const selectedCategory = categories.data?.find((c) => c.id === selected)
  const total = sum(byCategory.data)
  const count = byCategory.data?.reduce((n, i) => n + i.count, 0) ?? 0
  const rangeText =
    period.from && period.to
      ? `Del ${formatDate(period.from)} al ${formatDate(period.to)}`
      : period.from
        ? `Desde el ${formatDate(period.from)}`
        : period.to
          ? `Hasta el ${formatDate(period.to)}`
          : 'Todos los pagos'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PeriodPicker period={period} />
        <Button asChild variant="outline" size="sm">
          <a href={exportUrl(range)} download>
            <Download aria-hidden="true" /> Exportar a Excel (CSV)
          </a>
        </Button>
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">{rangeText}: </span>
        <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
        <span className="text-muted-foreground">
          {' '}
          en {count} {count === 1 ? 'pago' : 'pagos'}
        </span>
      </p>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Por categoría</CardTitle>
            <CardDescription>Tocá una categoría para ver su detalle.</CardDescription>
          </CardHeader>
          <CardContent>
            {byCategory.isPending ? (
              <LoadingRows rows={4} />
            ) : byCategory.error ? (
              <ErrorMessage error={byCategory.error} onRetry={() => byCategory.refetch()} />
            ) : byCategory.data.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay pagos en este período.</p>
            ) : (
              <BarList
                items={byCategory.data}
                selectedId={selected}
                onSelect={(item) => setSelected(item.id === selected ? null : item.id)}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por integrante</CardTitle>
            <CardDescription>Quién cargó cada pago.</CardDescription>
          </CardHeader>
          <CardContent>
            {byMember.isPending ? (
              <LoadingRows rows={2} />
            ) : byMember.data?.length ? (
              <BarList items={byMember.data} />
            ) : (
              <p className="text-muted-foreground text-sm">No hay pagos en este período.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <PatternsCard from={period.from} to={period.to} />

      {selectedCategory && (
        <Card>
          <CardHeader>
            <CardTitle>Detalle de {selectedCategory.name}</CardTitle>
            <CardDescription>
              {usesItems(selectedCategory)
                ? `Por ${(selectedCategory.item_label ?? 'elemento').toLowerCase()} (cuánto cuesta cada uno de los ${plural((selectedCategory.item_label ?? 'elemento').toLowerCase())}) y por tipo.`
                : 'Por tipo.'}
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="icon" aria-label="Cerrar detalle" onClick={() => setSelected(null)}>
                <X />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <CategoryDetail categoryId={selectedCategory.id} from={period.from} to={period.to} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const VIEWS = [
  { id: 'resumen', label: 'Resumen', icon: ChartBar },
  { id: 'mes', label: 'Este mes', icon: CalendarRange },
  { id: 'evolucion', label: 'Evolución', icon: ChartColumn },
  { id: 'comparar', label: 'Comparar', icon: Columns3 },
  { id: 'vencimientos', label: 'Vencimientos', icon: CalendarClock },
] as const
type View = (typeof VIEWS)[number]['id']

export function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const view: View = VIEWS.find((v) => v.id === params.get('vista'))?.id ?? 'resumen'
  const choose = (id: View) =>
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        copy.set('vista', id)
        return copy
      },
      { replace: true },
    )

  return (
    <>
      <PageHeader title="Informes" description="Cómo se reparte el gasto del hogar y cómo evoluciona." />
      <div
        role="tablist"
        aria-label="Vistas de informes"
        className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none]"
      >
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => choose(id)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              view === id
                ? 'border-brand text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {view === 'resumen' && <Summary />}
        {view === 'mes' && <MonthView />}
        {view === 'evolucion' && <EvolutionView />}
        {view === 'comparar' && <Comparison />}
        {view === 'vencimientos' && <DueDatesView />}
      </div>
    </>
  )
}
