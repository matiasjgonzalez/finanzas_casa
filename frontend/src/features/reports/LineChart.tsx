import { type PointerEvent, useState } from 'react'

import { formatMoney } from '@/lib/format'

export interface Line {
  key: string
  label: string
  color: string
  /** Valor de cada punto del eje x (null: todavía no hay dato, ej. días futuros). */
  values: (number | null)[]
  dashed?: boolean
}

const W = 600
const H = 200

/**
 * Líneas sobre un mismo eje (ej. gasto acumulado de este mes y del anterior). Al pasar el
 * mouse, una guía vertical muestra el valor de cada línea en ese punto.
 */
export function LineChart({
  lines,
  labels,
  xLabel,
  initial,
}: {
  lines: Line[]
  /** Rótulo de cada punto del eje x (ej. "1", "2"… días del mes). */
  labels: string[]
  /** Cómo se nombra un punto en el detalle (ej. (i) => "Día 5"). */
  xLabel: (index: number) => string
  /** Punto que se muestra al empezar (por defecto, el último con datos). */
  initial?: number
}) {
  const count = labels.length
  const max = Math.max(...lines.flatMap((l) => l.values.map((v) => v ?? 0)), 0) || 1
  const lastWithData = Math.max(...lines.map((l) => l.values.findLastIndex((v) => v !== null)), 0)
  const [active, setActive] = useState<number | null>(null)
  const shown = active ?? initial ?? lastWithData
  const x = (i: number) => (count > 1 ? (i / (count - 1)) * W : 0)
  const y = (v: number) => H - (v / max) * H

  const path = (values: (number | null)[]) =>
    values
      .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .map((point, i) => `${i === 0 ? 'M' : 'L'}${point}`)
      .join(' ')

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1)
    setActive(Math.round(ratio * (count - 1)))
  }

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm" aria-live="polite">
        <span className="text-muted-foreground">{xLabel(shown)}:</span>
        {lines.map((l) => (
          <span key={l.key} className="inline-flex items-center gap-1.5">
            <span
              className="w-4 border-t-2"
              style={{ borderColor: l.color, borderStyle: l.dashed ? 'dashed' : 'solid' }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{l.label}</span>
            <span className="font-semibold tabular-nums">
              {l.values[shown] != null ? formatMoney(l.values[shown]!) : '—'}
            </span>
          </span>
        ))}
      </figcaption>
      <div
        className="relative h-52 touch-none border-b"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
        role="img"
        aria-label={lines
          .map((l) => `${l.label}: ${formatMoney(l.values.findLast((v) => v !== null) ?? 0)}`)
          .join('; ')}
      >
        <div className="border-border/60 absolute inset-x-0 top-0 border-t border-dashed" aria-hidden="true" />
        <div className="border-border/60 absolute inset-x-0 top-1/2 border-t border-dashed" aria-hidden="true" />
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          {lines.map((l) => (
            <path
              key={l.key}
              d={path(l.values)}
              fill="none"
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray={l.dashed ? '6 4' : undefined}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {/* Guía vertical y puntos del día elegido (en HTML para que no se deformen). */}
        <div
          className="bg-foreground/40 pointer-events-none absolute inset-y-0 w-px"
          style={{ left: `${(x(shown) / W) * 100}%` }}
          aria-hidden="true"
        />
        {lines.map((l) =>
          l.values[shown] != null ? (
            <span
              key={l.key}
              className="border-card pointer-events-none absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2"
              style={{ left: `${(x(shown) / W) * 100}%`, bottom: `${(l.values[shown]! / max) * 100}%`, background: l.color }}
              aria-hidden="true"
            />
          ) : null,
        )}
      </div>
      <div className="text-muted-foreground relative -mt-1 h-4 text-xs" aria-hidden="true">
        {labels
          .map((label, i) => ({ label, i }))
          .filter(({ i }) => i === 0 || i === count - 1 || ((i + 1) % 5 === 0 && count - 1 - i > 2))
          .map(({ label, i }) => (
            <span
              key={i}
              className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: `${(x(i) / W) * 100}%` }}
            >
              {label}
            </span>
          ))}
      </div>
    </figure>
  )
}
