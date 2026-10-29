import { describe, expect, it } from 'vitest'

import { formatDate, formatMoney } from '@/lib/format'

// Intl usa espacios especiales (no separables) entre el símbolo y el número.
const normalizeSpaces = (text: string) => text.replace(/\s/g, ' ')

describe('formatMoney', () => {
  it('usa el formato argentino: punto para miles y coma para decimales', () => {
    expect(normalizeSpaces(formatMoney('1234567.5'))).toBe('$ 1.234.567,50')
  })

  it('acepta los importes como texto, tal como llegan de la API', () => {
    expect(normalizeSpaces(formatMoney('170000.00'))).toBe('$ 170.000,00')
  })

  it('muestra los negativos con signo', () => {
    expect(normalizeSpaces(formatMoney(-850))).toBe('-$ 850,00')
  })
})

describe('formatDate', () => {
  it('muestra día/mes/año', () => {
    expect(formatDate('2026-10-05')).toBe('05/10/2026')
  })

  it('no corre la fecha un día por la zona horaria', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
  })
})
