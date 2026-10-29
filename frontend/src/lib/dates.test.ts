import { describe, expect, it } from 'vitest'

import { addMonths, monthGrid, monthKey, parseMonth, periodRange, toISODate } from '@/lib/dates'

// 15 de marzo de 2026, en hora local.
const TODAY = new Date(2026, 2, 15)

describe('periodRange', () => {
  it('este mes', () => {
    expect(periodRange('this-month', TODAY)).toEqual({ from: '2026-03-01', to: '2026-03-31' })
  })

  it('mes anterior (febrero de un año no bisiesto)', () => {
    expect(periodRange('last-month', TODAY)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('mes anterior en enero pasa al año anterior', () => {
    expect(periodRange('last-month', new Date(2026, 0, 10))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    })
  })

  it('últimos 3 meses incluye el actual', () => {
    expect(periodRange('last-3-months', TODAY)).toEqual({ from: '2026-01-01', to: '2026-03-31' })
  })

  it('todo no tiene límites', () => {
    expect(periodRange('all', TODAY)).toEqual({})
  })
})

describe('toISODate', () => {
  it('usa la fecha local, sin correrse por la zona horaria', () => {
    expect(toISODate(new Date(2026, 0, 1, 23, 30))).toBe('2026-01-01')
  })
})

describe('grilla del calendario', () => {
  it('empieza el lunes y completa semanas enteras', () => {
    // Octubre de 2026 empieza un jueves: la grilla arranca el lunes 28 de septiembre.
    const grid = monthGrid(new Date(2026, 9, 1))

    expect(toISODate(grid[0])).toBe('2026-09-28')
    expect(toISODate(grid.at(-1)!)).toBe('2026-11-01')
    expect(grid.length % 7).toBe(0)
    expect(grid.length).toBe(35)
  })

  it('un mes que empieza en lunes no agrega días del mes anterior', () => {
    // Junio de 2026 empieza un lunes.
    expect(toISODate(monthGrid(new Date(2026, 5, 1))[0])).toBe('2026-06-01')
  })

  it('interpreta el mes de la URL y cae al mes actual si no es válido', () => {
    expect(toISODate(parseMonth('2026-02'))).toBe('2026-02-01')
    expect(toISODate(parseMonth('basura', new Date(2026, 9, 27)))).toBe('2026-10-01')
    expect(monthKey(addMonths(new Date(2026, 11, 1), 1))).toBe('2027-01')
  })
})
