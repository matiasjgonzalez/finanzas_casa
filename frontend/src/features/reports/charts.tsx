import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'

import type { BudgetStatus, GroupTotal } from '@/features/reports/api'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

// Gráficos simples hechos con HTML (sin bibliotecas): una sola serie, en el color de la
// marca. Los valores van siempre como texto, así se leen sin depender del color.

/** Porcentaje del total ("38 %"). */
function share(value: string, total: number): string {
  if (total <= 0) return '0 %'
  return `${Math.round((Number(value) / total) * 100)} %`
}

/** Barras horizontales ordenadas de mayor a menor (ej. gasto por categoría). */
export function BarList({
  items,
  currency,
  onSelect,
  selectedId,
}: {
  items: GroupTotal[]
  currency?: string
  /** Si se indica, cada fila es un botón (ej. para ver el detalle de una categoría). */
  onSelect?: (item: GroupTotal) => void
  selectedId?: string | null
}) {
  const max = Math.max(...items.map((i) => Number(i.total)), 0)
  const total = items.reduce((sum, i) => sum + Number(i.total), 0)
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const width = max > 0 ? Math.max((Number(item.total) / max) * 100, 1) : 0
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{item.name}</span>
              <span className="shrink-0 tabular-nums">
                {formatMoney(item.total, currency)}
                <span className="text-muted-foreground ml-2 text-xs">{share(item.total, total)}</span>
              </span>
            </div>
            <div className="bg-muted mt-1 h-2 overflow-hidden rounded-full" aria-hidden="true">
              <div className="bg-brand h-full rounded-full" style={{ width: `${width}%` }} />
            </div>
          </>
        )
        return (
          <li key={item.id ?? item.name}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item)}
                aria-pressed={selectedId === item.id}
                className={cn(
                  'hover:bg-accent focus-visible:ring-ring/50 -mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left outline-none focus-visible:ring-3',
                  selectedId === item.id && 'bg-accent',
                )}
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        )
      })}
    </ul>
  )
}

const STATUS = {
  ok: { label: 'En regla', icon: CircleCheck, bar: 'bg-positive', text: 'text-positive' },
  warning: { label: 'Cerca del límite', icon: TriangleAlert, bar: 'bg-warning', text: 'text-warning' },
  exceeded: { label: 'Superado', icon: CircleAlert, bar: 'bg-destructive', text: 'text-destructive' },
} satisfies Record<BudgetStatus, unknown>

/** Avance de un presupuesto: barra + estado con ícono y texto (no solo color). */
export function BudgetBar({
  spent,
  amount,
  status,
  currency,
}: {
  spent: string
  amount: string
  status: BudgetStatus
  currency?: string
}) {
  const { label, icon: Icon, bar, text } = STATUS[status]
  const ratio = Number(amount) > 0 ? Number(spent) / Number(amount) : 0
  const left = Number(amount) - Number(spent)
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="bg-muted h-2.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label={`${Math.round(ratio * 100)} % del presupuesto`}
      >
        <div className={cn('h-full rounded-full', bar)} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
        <span className={cn('inline-flex items-center gap-1 font-medium', text)}>
          <Icon className="size-3.5" aria-hidden="true" />
          {label} · {Math.round(ratio * 100)} %
        </span>
        <span className="text-muted-foreground tabular-nums">
          {left >= 0
            ? `Quedan ${formatMoney(left, currency)}`
            : `Pasado por ${formatMoney(-left, currency)}`}
        </span>
      </div>
    </div>
  )
}
