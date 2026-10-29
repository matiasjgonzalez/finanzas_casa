import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useState } from 'react'

import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface Panel {
  key: string
  name: string
  /** Un valor por cada mes de `months`. */
  values: number[]
}

/**
 * Un mini gráfico de columnas por grupo (ej. por categoría), todos con la MISMA escala: cada
 * uno arranca desde cero, así se comparan entre sí y mes a mes sin barras apiladas.
 */
export function SmallMultiples({
  panels,
  months,
}: {
  panels: Panel[]
  /** Rótulos de los meses: largo (para el detalle) y corto (bajo las columnas). */
  months: { long: string; short: string }[]
}) {
  const max = Math.max(...panels.flatMap((p) => p.values), 0)
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {panels.map((panel) => (
        <MiniPanel key={panel.key} panel={panel} months={months} max={max} />
      ))}
    </ul>
  )
}

function MiniPanel({
  panel,
  months,
  max,
}: {
  panel: Panel
  months: { long: string; short: string }[]
  max: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const last = panel.values.length - 1
  const shown = active ?? last
  const total = panel.values.reduce((a, b) => a + b, 0)
  const diff = panel.values[last] - (panel.values[last - 1] ?? 0)
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">{panel.name}</span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">Total {formatMoney(total)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-sm" aria-live="polite">
        <span>
          <span className="text-muted-foreground first-letter:uppercase">{months[shown]?.long}: </span>
          <span className="font-semibold tabular-nums">{formatMoney(panel.values[shown] ?? 0)}</span>
        </span>
        {active === null && last > 0 && diff !== 0 && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center text-xs tabular-nums',
              diff > 0 ? 'text-destructive' : 'text-positive',
            )}
            title="Contra el mes anterior"
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {formatMoney(Math.abs(diff))}
            <span className="sr-only">{diff > 0 ? ' más que el mes anterior' : ' menos que el mes anterior'}</span>
          </span>
        )}
      </div>
      <div className="relative h-20 border-b" onMouseLeave={() => setActive(null)}>
        <div className="border-border/60 absolute inset-x-0 top-0 border-t border-dashed" aria-hidden="true" />
        <ol className="relative flex h-full items-end gap-[2px]">
          {panel.values.map((value, i) => (
            <li key={i} className="flex h-full flex-1 items-end">
              <button
                type="button"
                className="group flex h-full w-full items-end justify-center outline-none"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${panel.name}, ${months[i].long}: ${formatMoney(value)}`}
              >
                <span
                  className={cn(
                    'bg-brand w-full max-w-8 rounded-t-[3px] transition-opacity group-focus-visible:ring-3',
                    active !== null && active !== i && 'opacity-40',
                  )}
                  style={{ height: max > 0 ? `${(value / max) * 100}%` : 0, minHeight: value > 0 ? 2 : 0 }}
                />
              </button>
            </li>
          ))}
        </ol>
      </div>
      <ol className="text-muted-foreground -mt-1 flex gap-[2px] text-center text-[10px]" aria-hidden="true">
        {months.map((m, i) => (
          <li key={i} className="flex-1 truncate">
            {m.short}
          </li>
        ))}
      </ol>
    </li>
  )
}
