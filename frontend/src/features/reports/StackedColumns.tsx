import { Table2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface Series {
  key: string
  label: string
  /** Color CSS (ej. "var(--brand)"). */
  color: string
  icon?: ReactNode
}

export interface ColumnRow {
  key: string
  /** Nombre completo (ej. "octubre de 2026"). */
  label: string
  /** Rótulo corto bajo la columna (ej. "oct"). */
  short: string
  values: Record<string, number>
}

interface StackedColumnsProps {
  rows: ColumnRow[]
  series: Series[]
  /** Cómo se muestra cada valor (por defecto, en pesos). */
  format?: (value: number) => string
  /** Referencia por columna (ej. el presupuesto de cada mes), dibujada como una marca horizontal. */
  reference?: { label: string; values: (number | null)[] }
  /** Columna destacada al empezar (por defecto, la última). */
  initial?: number
  /** Columna que se resalta siempre (ej. el mes elegido); las demás quedan atenuadas. */
  emphasis?: number
  height?: string
}

/** Escala del eje: montos cortos ("$ 1,2 M", "$ 450 mil") para los rótulos de las líneas guía. */
function compactMoney(value: number): string {
  if (value >= 1_000_000) {
    return `$ ${(value / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  }
  if (value >= 1_000) return `$ ${Math.round(value / 1_000).toLocaleString('es-AR')} mil`
  return `$ ${Math.round(value).toLocaleString('es-AR')}`
}

/**
 * Columnas (simples o apiladas) con leyenda, detalle al pasar el mouse y vista de tabla.
 * Los valores siempre se pueden leer como texto: no dependen solo del color.
 */
export function StackedColumns({
  rows,
  series,
  format = (v) => formatMoney(v),
  reference,
  initial,
  emphasis,
  height = 'h-48',
}: StackedColumnsProps) {
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const totals = rows.map((r) => series.reduce((s, x) => s + (r.values[x.key] ?? 0), 0))
  const max = Math.max(...totals, ...(reference?.values.map((v) => v ?? 0) ?? []), 0)
  const shown = active ?? initial ?? rows.length - 1
  const current = rows[shown]
  const stacked = series.length > 1

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Detalle de la columna elegida (al pasar el mouse o con el teclado). */}
        <figcaption className="flex min-h-10 flex-col gap-0.5 text-sm" aria-live="polite">
          {current && (
            <>
              <span>
                <span className="text-muted-foreground first-letter:uppercase">{current.label}: </span>
                <span className="font-semibold tabular-nums">{format(totals[shown])}</span>
                {reference && reference.values[shown] != null && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {reference.label.toLowerCase()} {format(reference.values[shown]!)}
                  </span>
                )}
              </span>
              {stacked && (
                <span className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                  {series
                    .filter((s) => (current.values[s.key] ?? 0) > 0)
                    .map((s) => (
                      <span key={s.key} className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                        {s.label} {format(current.values[s.key])}
                      </span>
                    ))}
                </span>
              )}
            </>
          )}
        </figcaption>
        <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          <Table2 aria-hidden="true" /> {asTable ? 'Ver gráfico' : 'Ver como tabla'}
        </Button>
      </div>

      {asTable ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              {series.map((s) => (
                <TableHead key={s.key} className="text-right">
                  {s.label}
                </TableHead>
              ))}
              {reference && <TableHead className="text-right">{reference.label}</TableHead>}
              {stacked && <TableHead className="text-right">Total</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.key}>
                <TableCell className="first-letter:uppercase">{r.label}</TableCell>
                {series.map((s) => (
                  <TableCell key={s.key} className="text-right tabular-nums">
                    {r.values[s.key] ? format(r.values[s.key]) : '—'}
                  </TableCell>
                ))}
                {reference && (
                  <TableCell className="text-right tabular-nums">
                    {reference.values[i] != null ? format(reference.values[i]!) : '—'}
                  </TableCell>
                )}
                {stacked && <TableCell className="text-right font-medium tabular-nums">{format(totals[i])}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <>
          <div className="flex gap-2">
            {/* Escala: el máximo, la mitad y cero, a la altura de cada línea guía. */}
            <div
              className={cn(
                'text-muted-foreground relative w-14 shrink-0 text-right text-[0.7rem] tabular-nums',
                height,
              )}
              aria-hidden="true"
            >
              {max > 0 && (
                <>
                  <span className="absolute right-0 top-0 -translate-y-1/2">{compactMoney(max)}</span>
                  <span className="absolute right-0 top-1/2 -translate-y-1/2">{compactMoney(max / 2)}</span>
                </>
              )}
              <span className="absolute right-0 bottom-0 translate-y-1/2">$ 0</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className={cn('relative border-b', height)} onMouseLeave={() => setActive(null)}>
                <div className="border-border/60 absolute inset-x-0 top-0 border-t border-dashed" aria-hidden="true" />
                <div
                  className="border-border/60 absolute inset-x-0 top-1/2 border-t border-dashed"
                  aria-hidden="true"
                />
                <ol className="relative flex h-full items-end gap-0.5">
                  {rows.map((r, i) => {
                    const ref = reference?.values[i]
                    return (
                      <li key={r.key} className="relative flex h-full flex-1 items-end">
                        <button
                          type="button"
                          className="group flex h-full w-full items-end justify-center outline-none"
                          onMouseEnter={() => setActive(i)}
                          onFocus={() => setActive(i)}
                          onBlur={() => setActive(null)}
                          aria-label={`${r.label}: ${format(totals[i])}`}
                        >
                          {/* Segmentos de abajo hacia arriba, separados por 2px del fondo. */}
                          <span
                            className={cn(
                              'flex w-full max-w-10 flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px] transition-opacity group-focus-visible:ring-3',
                              // Al pasar el mouse se resalta esa columna; si no, la destacada (si hay).
                              (active !== null ? active !== i : emphasis !== undefined && emphasis !== i) &&
                                'opacity-40',
                            )}
                            style={{ height: max > 0 ? `${(totals[i] / max) * 100}%` : 0 }}
                          >
                            {series.map((s) => {
                              const value = r.values[s.key] ?? 0
                              if (value <= 0) return null
                              return (
                                <span
                                  key={s.key}
                                  className="block w-full shrink-0"
                                  style={{ background: s.color, height: `${(value / totals[i]) * 100}%`, minHeight: 2 }}
                                />
                              )
                            })}
                          </span>
                        </button>
                        {ref != null && max > 0 && (
                          <span
                            className="border-foreground pointer-events-none absolute inset-x-0 border-t-2 border-dashed"
                            style={{ bottom: `${(ref / max) * 100}%` }}
                            aria-hidden="true"
                          />
                        )}
                      </li>
                    )
                  })}
                </ol>
              </div>
              <ol className="text-muted-foreground -mt-1 flex gap-0.5 text-center text-xs" aria-hidden="true">
                {rows.map((r, i) => (
                  <li key={r.key} className={cn('flex-1 truncate', i === emphasis && 'text-foreground font-semibold')}>
                    {/* En el celular no entran tres letras: va la inicial (E F M A M J…). */}
                    <span className="sm:hidden">{r.short.charAt(0).toUpperCase()}</span>
                    <span className="hidden sm:inline">{r.short}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          {(stacked || reference) && (
            <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Referencias">
              {stacked &&
                series.map((s) => (
                  <li key={s.key} className="inline-flex items-center gap-1.5">
                    {s.icon ?? (
                      <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                    )}
                    {s.label}
                  </li>
                ))}
              {reference && (
                <li className="inline-flex items-center gap-1.5">
                  <span className="border-foreground w-4 border-t-2 border-dashed" aria-hidden="true" />
                  {reference.label}
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </figure>
  )
}
