/**
 * Importes escritos por el usuario en formato argentino.
 *
 * Se convierten a texto con punto decimal ("1234.56") para enviarlos a la API sin pasar por
 * números de JavaScript (que son float y pueden perder precisión). Los cálculos los hace el backend.
 */

/**
 * "1.234,56" → "1234.56" · "1234,5" → "1234.50" · "1500" → "1500.00" · "12.5" → "12.50"
 * Devuelve null si el texto no es un importe válido.
 *
 * Regla: la coma es el separador decimal. Si no hay coma, un punto seguido de exactamente
 * tres dígitos se toma como separador de miles ("1.500" = mil quinientos).
 */
export function parseAmountInput(raw: string): string | null {
  let text = raw.trim().replace(/\s|\$/g, '')
  if (!text) return null

  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '')
  }

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) return null
  const integer = match[1].replace(/^0+(?=\d)/, '')
  const decimals = (match[2] ?? '').padEnd(2, '0')
  return `${integer}.${decimals}`
}

/** "1234.50" (de la API) → "1.234,50" (para editar en el formulario, con el mismo formato
 * con que se escribe). Se arma a partir del texto para no pasar por float. */
export function amountToInput(apiAmount: string): string {
  const [integer, decimals = '00'] = apiAmount.split('.')
  const withThousands = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${withThousands},${decimals.padEnd(2, '0')}`
}

/**
 * Formato mientras se escribe: agrega los puntos de miles y admite una coma decimal con hasta
 * dos dígitos. "10000" → "10.000" · "1500,5" → "1.500,5" · "15.300,50" queda igual.
 *
 * Si quien escribe pone un punto y todavía no se sabe si es de miles o decimal ("15." o
 * "15.3", que puede seguir como "15.300"), se deja como está; al salir del campo
 * (formatAmountFinal) se interpreta con las reglas de parseAmountInput.
 */
export function formatAmountTyping(raw: string): string {
  const text = raw.replace(/[^\d.,]/g, '')
  if (!text.includes(',') && /\.\d{0,2}$/.test(text)) return text
  const commaAt = text.indexOf(',')
  const integerPart = (commaAt === -1 ? text : text.slice(0, commaAt)).replace(/\D/g, '')
  const decimals = commaAt === -1 ? null : text.slice(commaAt + 1).replace(/\D/g, '').slice(0, 2)
  const integer = integerPart.replace(/^0+(?=\d)/, '')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (decimals === null) return grouped
  return `${grouped || '0'},${decimals}`
}

/** Formato final al salir del campo: "10.000" → "10.000,00". Si no es válido, lo deja igual. */
export function formatAmountFinal(raw: string): string {
  const parsed = parseAmountInput(raw)
  return parsed === null ? raw : amountToInput(parsed)
}
