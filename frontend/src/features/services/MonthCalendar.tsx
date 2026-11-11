import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { addMonths, formatMonth, monthGrid, todayISO, toISODate } from '@/lib/dates'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function MonthNav({ month, goTo, children }: { month: Date; goTo: (d: Date) => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-lg font-semibold first-letter:uppercase" aria-live="polite">
          {formatMonth(month)}
        </h2>
        {children}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={() => goTo(addMonths(month, -1))}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" onClick={() => goTo(new Date())}>
          Hoy
        </Button>
        <Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={() => goTo(addMonths(month, 1))}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

interface MonthGridProps<T> {
  month: Date
  items: T[]
  /** Día ("AAAA-MM-DD") en que se muestra cada elemento. */
  dateOf: (item: T) => string
  keyOf: (item: T) => string
  render: (item: T) => ReactNode
  /** Pie opcional de cada día (ej. el total pagado). */
  footer?: (items: T[]) => ReactNode
}

/** Grilla mensual (lunes a domingo) con los elementos de cada día. */
export function MonthGrid<T>({ month, items, dateOf, keyOf, render, footer }: MonthGridProps<T>) {
  const today = todayISO()
  const byDay = new Map<string, T[]>()
  for (const item of items) byDay.set(dateOf(item), [...(byDay.get(dateOf(item)) ?? []), item])
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-xl border" role="grid" aria-label={formatMonth(month)}>
      {WEEKDAYS.map((d) => (
        <div key={d} role="columnheader" className="bg-muted text-muted-foreground border-b px-2 py-1.5 text-xs font-medium">
          {d}
        </div>
      ))}
      {monthGrid(month).map((day) => {
        const iso = toISODate(day)
        const inMonth = day.getMonth() === month.getMonth()
        const dayItems = byDay.get(iso) ?? []
        return (
          <div
            key={iso}
            role="gridcell"
            aria-label={formatDate(iso)}
            className={cn(
              'bg-card flex min-h-24 flex-col border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0',
              !inMonth && 'bg-muted/40',
            )}
          >
            <div
              className={cn(
                'mb-1 flex size-6 items-center justify-center rounded-full text-xs',
                !inMonth && 'text-muted-foreground',
                iso === today && 'bg-brand text-brand-foreground font-semibold',
              )}
            >
              {day.getDate()}
            </div>
            <ul className="flex flex-col gap-1">
              {dayItems.map((item) => (
                <li key={keyOf(item)}>{render(item)}</li>
              ))}
            </ul>
            {footer && dayItems.length > 0 && <div className="mt-auto pt-1">{footer(dayItems)}</div>}
          </div>
        )
      })}
    </div>
  )
}

/** Número y día de la semana para las listas del celular. */
export function DayBadge({ iso }: { iso: string }) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center leading-tight">
      <span className="text-lg font-semibold">{Number(iso.slice(8))}</span>
      <span className="text-muted-foreground text-xs">
        {new Intl.DateTimeFormat('es-AR', { weekday: 'short' }).format(new Date(`${iso}T12:00`))}
      </span>
    </div>
  )
}
