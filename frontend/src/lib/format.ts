/**
 * Formato argentino para importes y fechas.
 *
 * Solo se usa para MOSTRAR datos: los cálculos de dinero se hacen en el backend con decimales
 * exactos. La API envía los importes como texto ("1234.50") para no perder precisión.
 */

const LOCALE = 'es-AR'

const moneyFormatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(value: string | number, currency = 'ARS'): string {
  let formatter = moneyFormatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency })
    moneyFormatters.set(currency, formatter)
  }
  return formatter.format(Number(value))
}

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Fecha y hora de un instante (ej. "2026-10-26T18:04:00Z") en la zona horaria del navegador. */
export function formatDateTime(isoDateTime: string): string {
  return dateTimeFormatter.format(new Date(isoDateTime))
}

/**
 * Convierte "2026-10-05" en "05/10/2026".
 *
 * Importante: new Date("2026-10-05") interpreta la fecha en UTC y en Argentina (UTC-3) se
 * mostraría como 04/10. Por eso se arma la fecha con año, mes y día locales.
 */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return dateFormatter.format(new Date(year, month - 1, day))
}
