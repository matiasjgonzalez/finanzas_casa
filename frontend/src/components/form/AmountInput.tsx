import type { ChangeEvent, ComponentProps, FocusEvent } from 'react'

import { Input } from '@/components/ui/input'
import { formatAmountFinal, formatAmountTyping } from '@/lib/amount'
import { cn } from '@/lib/utils'

/**
 * Importe en formato argentino: los puntos de miles aparecen mientras se escribe y al salir
 * del campo se completan los decimales (10000 → 10.000,00). Funciona con register() de
 * react-hook-form: el valor se corrige en el propio campo antes de avisar el cambio.
 */
export function AmountInput({ className, onChange, onBlur, ...props }: ComponentProps<'input'>) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    // Se conserva la posición del cursor contando los caracteres (sin puntos) a su derecha.
    const cursor = input.selectionStart ?? input.value.length
    const rightSide = input.value.slice(cursor).replace(/\./g, '').length
    const formatted = formatAmountTyping(input.value)
    input.value = formatted
    let position = formatted.length
    for (let seen = 0; position > 0 && seen < rightSide; position--) {
      if (formatted[position - 1] !== '.') seen++
    }
    input.setSelectionRange?.(position, position)
    onChange?.(event)
  }

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    event.target.value = formatAmountFinal(event.target.value)
    onBlur?.(event)
  }

  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      placeholder="0,00"
      className={cn('h-10 tabular-nums', className)}
      onChange={handleChange}
      onBlur={handleBlur}
      {...props}
    />
  )
}
