import { describe, expect, it } from 'vitest'

import { amountToInput, formatAmountFinal, formatAmountTyping, parseAmountInput } from '@/lib/amount'

describe('parseAmountInput', () => {
  it.each([
    ['1.234,56', '1234.56'],
    ['1234,5', '1234.50'],
    ['1500', '1500.00'],
    ['1.500', '1500.00'],
    ['1.500.000', '1500000.00'],
    ['12.5', '12.50'],
    ['12.50', '12.50'],
    ['$ 2.000,00', '2000.00'],
    ['0,99', '0.99'],
    ['007', '7.00'],
  ])('interpreta "%s" como %s', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected)
  })

  it.each(['', 'abc', '1,234,5', '12,345', '-5', '1.2.3'])('rechaza "%s"', (input) => {
    expect(parseAmountInput(input)).toBeNull()
  })
})

describe('amountToInput', () => {
  it.each([
    ['1234.50', '1.234,50'],
    ['45678.90', '45.678,90'],
    ['999.00', '999,00'],
    ['1500000.05', '1.500.000,05'],
  ])('muestra %s como %s', (api, input) => {
    expect(amountToInput(api)).toBe(input)
  })

  it('el formato de edición se vuelve a interpretar igual (ida y vuelta)', () => {
    for (const api of ['1234.50', '45678.90', '0.99', '1500000.05']) {
      expect(parseAmountInput(amountToInput(api))).toBe(api)
    }
  })
})

describe('formatAmountTyping', () => {
  it.each([
    ['10000', '10.000'],
    ['1234567', '1.234.567'],
    ['10.0000', '100.000'],
    ['1500,5', '1.500,5'],
    ['1500,567', '1.500,56'],
    ['15.', '15.'],
    ['15.3', '15.3'],
    ['15.300', '15.300'],
    ['15.300,5', '15.300,5'],
    ['1500.50', '1500.50'],
    [',5', '0,5'],
    ['abc12', '12'],
    ['', ''],
  ])('%s → %s', (raw, expected) => {
    expect(formatAmountTyping(raw)).toBe(expected)
  })
})

describe('formatAmountFinal', () => {
  it('completa los decimales al salir del campo', () => {
    expect(formatAmountFinal('10.000')).toBe('10.000,00')
    expect(formatAmountFinal('1.500,5')).toBe('1.500,50')
    expect(formatAmountFinal('no es un número')).toBe('no es un número')
  })
})
