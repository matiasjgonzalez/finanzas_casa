import { describe, expect, it } from 'vitest'

import { dueDatePhrase } from '@/lib/relativeDate'

const TODAY = '2026-10-29' // jueves

describe('dueDatePhrase', () => {
  it.each([
    ['2026-10-24', 'Venció hace 5 días'],
    ['2026-10-28', 'Venció ayer'],
    ['2026-10-29', 'Vence hoy'],
    ['2026-10-30', 'Vence mañana'],
    ['2026-11-02', 'Vence el lunes, 2 de noviembre'],
  ])('%s → %s', (due, phrase) => {
    expect(dueDatePhrase(due, TODAY)).toBe(phrase)
  })
})
