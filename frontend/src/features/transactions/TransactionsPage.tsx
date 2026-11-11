import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Paperclip, Plus, ReceiptText, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { DateBlock } from '@/components/DateBlock'
import { PageHeader } from '@/components/PageHeader'
import { ScopeTabs } from '@/components/ScopeTabs'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usesItems, usesTypes } from '@/features/catalog/api'
import { exportUrl } from '@/features/reports/api'
import { useCategories } from '@/features/catalog/useCatalog'
import { paymentSubtitle, paymentTitle, type Transaction } from '@/features/transactions/types'
import {
  activeFilterCount,
  type FilterState,
  PAGE_SIZE,
  useTransactionFilters,
} from '@/features/transactions/useTransactionFilters'
import { useTransactionList } from '@/features/transactions/useTransactions'
import { listMembers } from '@/features/users/api'
import { PERIOD_LABELS, type PeriodPreset } from '@/lib/dates'
import { formatDate, formatMoney } from '@/lib/format'
import { scopeParam, useScope } from '@/lib/scope'

type Update = (changes: Partial<FilterState>) => void

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  const id = `filtro-${label.toLowerCase().replace(/\s/g, '-')}`
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <NativeSelect
        id={id}
        className="w-full [&_select]:h-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </NativeSelect>
    </div>
  )
}

function Filters({ state, update, reset }: { state: FilterState; update: Update; reset: () => void }) {
  const categories = useCategories()
  const household = useScope() === 'household'
  const members = useQuery({
    queryKey: ['members'],
    queryFn: listMembers,
    staleTime: 5 * 60_000,
    enabled: household,
  })
  const category = categories.data?.find((c) => c.id === state.category)
  // La búsqueda espera a que se deje de escribir (300 ms) para no consultar por cada letra.
  const [search, setSearch] = useState(state.q)
  useEffect(() => {
    if (search === state.q) return
    const timer = setTimeout(() => update({ q: search }), 300)
    return () => clearTimeout(timer)
  })

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Buscar pagos"
              placeholder="Buscar (descripción, tipo, auto…)"
              className="h-9 pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <NativeSelect
            aria-label="Período"
            className="w-full sm:w-48 [&_select]:h-9"
            value={state.period}
            onChange={(e) => update({ period: e.target.value as FilterState['period'] })}
          >
            {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
              <NativeSelectOption key={p} value={p}>
                {PERIOD_LABELS[p]}
              </NativeSelectOption>
            ))}
            <NativeSelectOption value="custom">Elegir fechas…</NativeSelectOption>
          </NativeSelect>
        </div>

        {state.period === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="desde" className="text-muted-foreground text-xs">
                Desde
              </Label>
              <Input
                id="desde"
                type="date"
                className="h-9"
                value={state.from}
                onChange={(e) => update({ from: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hasta" className="text-muted-foreground text-xs">
                Hasta
              </Label>
              <Input
                id="hasta"
                type="date"
                className="h-9"
                value={state.to}
                onChange={(e) => update({ to: e.target.value })}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <FilterSelect label="Categoría" value={state.category} onChange={(v) => update({ category: v })}>
            <NativeSelectOption value="">Todas</NativeSelectOption>
            {categories.data?.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </FilterSelect>
          {category && usesItems(category) && (
            <FilterSelect
              label={category.item_label ?? 'Elemento'}
              value={state.item}
              onChange={(v) => update({ item: v })}
            >
              <NativeSelectOption value="">Todos</NativeSelectOption>
              {category.items.map((i) => (
                <NativeSelectOption key={i.id} value={i.id}>
                  {i.name}
                </NativeSelectOption>
              ))}
            </FilterSelect>
          )}
          {category && usesTypes(category) && (
            <FilterSelect label="Tipo" value={state.type} onChange={(v) => update({ type: v })}>
              <NativeSelectOption value="">Todos</NativeSelectOption>
              {category.types.map((t) => (
                <NativeSelectOption key={t.id} value={t.id}>
                  {t.name}
                </NativeSelectOption>
              ))}
            </FilterSelect>
          )}
          {household && (
            <FilterSelect label="Registrado por" value={state.user} onChange={(v) => update({ user: v })}>
              <NativeSelectOption value="">Cualquiera</NativeSelectOption>
              {members.data?.map((m) => (
                <NativeSelectOption key={m.id} value={m.id}>
                  {m.full_name}
                </NativeSelectOption>
              ))}
            </FilterSelect>
          )}
        </div>

        {activeFilterCount(state) > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              setSearch('')
              reset()
            }}
          >
            <X aria-hidden="true" /> Limpiar filtros
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function SortHeader({
  label,
  field,
  state,
  update,
  className,
}: {
  label: string
  field: FilterState['sort']
  state: FilterState
  update: Update
  className?: string
}) {
  const active = state.sort === field
  const nextOrder = active && state.order === 'desc' ? 'asc' : 'desc'
  return (
    <TableHead
      className={className}
      aria-sort={active ? (state.order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="hover:text-foreground inline-flex items-center gap-1 font-medium"
        onClick={() => update({ sort: field, order: nextOrder, page: state.page })}
      >
        {label}
        {active &&
          (state.order === 'asc' ? (
            <ArrowUp className="size-3.5" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3.5" aria-hidden="true" />
          ))}
      </button>
    </TableHead>
  )
}

function AttachmentMark({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="inline-flex items-center gap-0.5" title={`${count} comprobante(s)`}>
      <Paperclip className="size-3" aria-hidden="true" />
      <span className="sr-only">Con comprobante:</span>
      {count}
    </span>
  )
}

function PaymentsTable({
  items,
  state,
  update,
  showCreator,
}: {
  items: Transaction[]
  state: FilterState
  update: Update
  /** En "Gastos del hogar": quién cargó cada pago. */
  showCreator: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortHeader label="Fecha de pago" field="date" state={state} update={update} className="pl-4" />
          <SortHeader label="Detalle" field="description" state={state} update={update} />
          {showCreator && <TableHead className="hidden lg:table-cell">Registró</TableHead>}
          <SortHeader label="Importe" field="amount" state={state} update={update} className="pr-4 text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="pl-4">
              <DateBlock iso={t.occurred_on} />
            </TableCell>
            <TableCell className="w-full max-w-0">
              <Link to={`/pagos/${t.id}`} className="block truncate font-medium hover:underline">
                {paymentTitle(t)}
              </Link>
              {(paymentSubtitle(t) || t.attachments_count > 0) && (
                <span className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
                  {paymentSubtitle(t)}
                  <AttachmentMark count={t.attachments_count} />
                </span>
              )}
            </TableCell>
            {showCreator && (
              <TableCell className="text-muted-foreground hidden whitespace-nowrap lg:table-cell">
                {t.created_by.full_name}
              </TableCell>
            )}
            <TableCell className="pr-4 text-right font-medium whitespace-nowrap tabular-nums">
              {formatMoney(t.amount, t.currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PaymentsList({ items, showCreator }: { items: Transaction[]; showCreator: boolean }) {
  return (
    <ul className="divide-y">
      {items.map((t) => (
        <li key={t.id}>
          <Link to={`/pagos/${t.id}`} className="hover:bg-accent flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{paymentTitle(t)}</p>
              <p className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
                {[formatDate(t.occurred_on), paymentSubtitle(t), showCreator && t.created_by.full_name]
                  .filter(Boolean)
                  .join(' · ')}
                <AttachmentMark count={t.attachments_count} />
              </p>
            </div>
            <span className="font-medium whitespace-nowrap tabular-nums">
              {formatMoney(t.amount, t.currency)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// Períodos que se ofrecen como botones (los demás, en "Buscar y filtrar").
const QUICK_PERIODS: PeriodPreset[] = ['this-month', 'last-month', 'all']

export function TransactionsPage() {
  const { state, update, reset, query: filters } = useTransactionFilters()
  // Un integrante siempre ve lo suyo, aunque la URL diga otra cosa.
  const scope = useScope()
  const household = scope === 'household'
  const query = household ? filters : { ...filters, scope: undefined, created_by_id: undefined }
  // Los filtros se muestran abiertos solo si ya hay alguno aplicado.
  const [showFilters, setShowFilters] = useState(() => activeFilterCount(state) > 0)
  const { data, error, isPending, isPlaceholderData, refetch } = useTransactionList(query)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="flex flex-col gap-4">
      {/* "Cargar un pago" está arriba (barra superior) y en el botón flotante del celular. */}
      <PageHeader
        title="Pagos hechos"
        description={household ? 'Los pagos de todos los integrantes del hogar.' : 'Los pagos que cargaste vos.'}
      />
      <ScopeTabs scope={scope} onChange={(next) => update({ vista: scopeParam(next), user: '' })} />

      {/* Lo más usado a la vista (el período); la búsqueda y los filtros, detrás de un botón. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
          {QUICK_PERIODS.map((p) => (
            <Button
              key={p}
              variant={state.period === p ? 'default' : 'outline'}
              aria-pressed={state.period === p}
              className="h-11 px-4 text-base"
              onClick={() => update({ period: p })}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          className="h-11 px-4 text-base sm:ml-auto"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal aria-hidden="true" />
          {showFilters ? 'Ocultar filtros' : 'Buscar y filtrar'}
          {activeFilterCount(state) > 0 && ` (${activeFilterCount(state)})`}
        </Button>
      </div>
      {showFilters && <Filters state={state} update={update} reset={reset} />}

      {data && (
        <div className="bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-5 py-4">
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1" aria-live="polite">
            <span className="text-muted-foreground">Total pagado</span>
            <strong className="text-2xl tabular-nums">{formatMoney(data.total_amount)}</strong>
            <span className="text-muted-foreground">
              en {data.total} {data.total === 1 ? 'pago' : 'pagos'}
            </span>
          </p>
          {/* Los pagos del período elegido, para abrir en Excel. */}
          <Button asChild variant="outline" className="h-11 px-4 text-base sm:ml-auto">
            <a href={exportUrl({ date_from: query.date_from, date_to: query.date_to, scope: query.scope })} download>
              <Download aria-hidden="true" />
              Exportar a Excel
            </a>
          </Button>
        </div>
      )}

      <Card className="py-0">
        <CardContent className="p-0" aria-busy={isPlaceholderData}>
          {isPending ? (
            <div className="p-4">
              <LoadingRows rows={6} />
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorMessage error={error} onRetry={() => refetch()} />
            </div>
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <ReceiptText className="text-muted-foreground size-8" aria-hidden="true" />
              <p className="font-medium">No hay pagos para mostrar.</p>
              <p className="text-muted-foreground text-sm">
                {activeFilterCount(state) > 0 || state.period !== 'all'
                  ? 'Probá con otro período o quitá algunos filtros.'
                  : household
                    ? 'Todavía nadie cargó pagos en el hogar.'
                    : 'Registrá tu primer pago.'}
              </p>
              <Button asChild>
                <Link to="/pagos/nuevo">
                  <Plus aria-hidden="true" /> Nuevo pago
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <PaymentsTable items={data.items} state={state} update={update} showCreator={household} />
              </div>
              <div className="md:hidden">
                <PaymentsList items={data.items} showCreator={household} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {data && data.total > PAGE_SIZE && (
        <nav aria-label="Paginación" className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-muted-foreground mr-auto text-sm">
            Mostrando {(state.page - 1) * PAGE_SIZE + 1}–{Math.min(state.page * PAGE_SIZE, data.total)} de {data.total}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => update({ page: state.page - 1 })}
            disabled={state.page <= 1}
          >
            <ChevronLeft aria-hidden="true" /> Anterior
          </Button>
          <span className="text-muted-foreground text-sm">
            Página {state.page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => update({ page: state.page + 1 })}
            disabled={state.page >= totalPages}
          >
            Siguiente <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  )
}
