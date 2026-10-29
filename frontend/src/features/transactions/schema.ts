import { z } from 'zod'

import { type Category, usesItems, usesTypes } from '@/features/catalog/api'
import type { TransactionInput } from '@/features/transactions/types'
import { parseAmountInput } from '@/lib/amount'

// Validación para avisar ANTES de enviar. El backend vuelve a validar todo (incluido que el
// tipo y el elemento pertenezcan a la categoría y la categoría al hogar).
export function makePaymentSchema(categories: Category[]) {
  return z
    .object({
      amount: z
        .string()
        .min(1, 'Ingresá el importe.')
        .refine((v) => parseAmountInput(v) !== null, 'Escribí el importe como 1.234,56.')
        .refine((v) => Number(parseAmountInput(v)) > 0, 'El importe tiene que ser mayor a cero.')
        .refine(
          (v) => (parseAmountInput(v)?.split('.')[0].length ?? 0) <= 12,
          'El importe es demasiado grande.',
        ),
      occurred_on: z.string().min(1, 'Elegí la fecha de pago.'),
      category_id: z.string().min(1, 'Elegí una categoría.'),
      item_id: z.string(),
      category_type_id: z.string(),
      description: z.string().trim().max(200, 'Máximo 200 caracteres.'),
      notes: z.string().max(2000, 'Máximo 2000 caracteres.'),
    })
    .superRefine((v, ctx) => {
      const category = categories.find((c) => c.id === v.category_id)
      if (!category) return
      if (usesItems(category) && !v.item_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['item_id'],
          message: `Elegí qué ${(category.item_label ?? 'elemento').toLowerCase()}.`,
        })
      }
      if (usesTypes(category) && !v.category_type_id) {
        ctx.addIssue({ code: 'custom', path: ['category_type_id'], message: 'Elegí un tipo.' })
      }
    })
}

export type PaymentFormValues = z.infer<ReturnType<typeof makePaymentSchema>>

/** Valores del formulario → datos para la API (sin tipo ni elemento si la categoría no los usa). */
export function toTransactionInput(
  values: PaymentFormValues,
  categories: Category[],
): TransactionInput {
  const category = categories.find((c) => c.id === values.category_id)
  return {
    amount: parseAmountInput(values.amount) ?? '',
    occurred_on: values.occurred_on,
    category_id: values.category_id,
    item_id: category && usesItems(category) ? values.item_id || null : null,
    category_type_id: category && usesTypes(category) ? values.category_type_id || null : null,
    description: values.description.trim() || null,
    notes: values.notes.trim() || null,
  }
}

// Mismas reglas que el backend (app/services/files.py y MAX_UPLOAD_MB).
export const ACCEPTED_FILES = '.pdf,.jpg,.jpeg,.png,.webp'
export const MAX_FILE_MB = 10

/** Revisión rápida en el navegador; el backend valida el contenido real del archivo. */
export function checkFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ACCEPTED_FILES.split(',').includes(`.${extension}`)) {
    return `«${file.name}»: formato no admitido (PDF, JPG, PNG o WEBP).`
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `«${file.name}» supera el máximo de ${MAX_FILE_MB} MB.`
  }
  if (file.size === 0) return `«${file.name}» está vacío.`
  return null
}
