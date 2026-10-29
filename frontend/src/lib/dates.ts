/** Fechas en formato "AAAA-MM-DD" calculadas en la hora LOCAL (no en UTC). */

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export type PeriodPreset = 'this-month' | 'last-month' | 'last-3-months' | 'this-year' | 'all'

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  'this-month': 'Este mes',
  'last-month': 'Mes anterior',
  'last-3-months': 'Últimos 3 meses',
  'this-year': 'Este año',
  all: 'Todo',
}

/** Rango [desde, hasta] de un período predefinido, relativo a `today`. */
export function periodRange(
  preset: PeriodPreset,
  today = new Date(),
): { from?: string; to?: string } {
  const y = today.getFullYear()
  const m = today.getMonth()
  switch (preset) {
    case 'this-month':
      return { from: toISODate(new Date(y, m, 1)), to: toISODate(new Date(y, m + 1, 0)) }
    case 'last-month':
      return { from: toISODate(new Date(y, m - 1, 1)), to: toISODate(new Date(y, m, 0)) }
    case 'last-3-months':
      return { from: toISODate(new Date(y, m - 2, 1)), to: toISODate(new Date(y, m + 1, 0)) }
    case 'this-year':
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    case 'all':
      return {}
  }
}

/** "2026-10" del mes de una fecha. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

/** Primer día del mes "AAAA-MM" (en hora local). Si el texto no es válido, el mes actual. */
export function parseMonth(key: string | null, today = new Date()): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(key ?? '')
  if (!match) return new Date(today.getFullYear(), today.getMonth(), 1)
  return new Date(Number(match[1]), Number(match[2]) - 1, 1)
}

export function addMonths(month: Date, delta: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1)
}

/**
 * Días de la grilla de un mes: semanas completas de lunes a domingo (como se usa en Argentina),
 * incluyendo los días del mes anterior y siguiente que completan la primera y la última semana.
 */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const offset = (first.getDay() + 6) % 7 // lunes = 0
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  const totalDays = Math.ceil((offset + last.getDate()) / 7) * 7
  return Array.from(
    { length: totalDays },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  )
}

const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })

/** "octubre de 2026" */
export function formatMonth(month: Date): string {
  return monthFormatter.format(month)
}
