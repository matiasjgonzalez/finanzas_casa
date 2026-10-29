import { todayISO } from '@/lib/dates'

const longDate = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T12:00`)
  const to = new Date(`${toISO}T12:00`)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * Cuándo vence una cuenta, dicho como lo diría una persona:
 * "Venció hace 5 días", "Venció ayer", "Vence hoy", "Vence mañana",
 * "Vence el lunes 3 de noviembre".
 */
export function dueDatePhrase(dueISO: string, todayIso = todayISO()): string {
  const days = daysBetween(todayIso, dueISO)
  if (days < -1) return `Venció hace ${-days} días`
  if (days === -1) return 'Venció ayer'
  if (days === 0) return 'Vence hoy'
  if (days === 1) return 'Vence mañana'
  return `Vence el ${longDate.format(new Date(`${dueISO}T12:00`))}`
}

/** Días que faltan (negativo si ya venció). */
export function daysUntil(dueISO: string, todayIso = todayISO()): number {
  return daysBetween(todayIso, dueISO)
}
