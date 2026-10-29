import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, LoaderCircle, Paperclip, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { AmountInput } from '@/components/form/AmountInput'
import { FormField } from '@/components/form/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Category } from '@/features/catalog/api'
import { CategoryPathFields } from '@/features/catalog/CategoryPathFields'
import {
  ACCEPTED_FILES,
  checkFile,
  makePaymentSchema,
  type PaymentFormValues,
  toTransactionInput,
} from '@/features/transactions/schema'
import type { TransactionInput } from '@/features/transactions/types'

interface TransactionFormProps {
  defaultValues: PaymentFormValues
  categories: Category[]
  onSubmit: (input: TransactionInput, files: File[]) => void
  submitting: boolean
  error: Error | null
  submitLabel: string
  /** Permite elegir comprobantes antes de guardar (solo al crear). */
  allowFiles?: boolean
  onCancel: () => void
}

export function TransactionForm({
  defaultValues,
  categories,
  onSubmit,
  submitting,
  error,
  submitLabel,
  allowFiles = false,
  onCancel,
}: TransactionFormProps) {
  const [files, setFiles] = useState<File[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const schema = useMemo(() => makePaymentSchema(categories), [categories])
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<PaymentFormValues>({ resolver: zodResolver(schema), defaultValues })

  const [categoryId, itemId, typeId] = useWatch({
    control,
    name: ['category_id', 'item_id', 'category_type_id'],
  })

  const addFiles = (list: FileList | null) => {
    const chosen = Array.from(list ?? [])
    setFileErrors(chosen.map(checkFile).filter((m): m is string => m !== null))
    setFiles((prev) => [...prev, ...chosen.filter((f) => checkFile(f) === null)])
  }

  const submit = handleSubmit((values) => onSubmit(toTransactionInput(values, categories), files))

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {error && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Importe" required error={errors.amount?.message} hint="Ej.: 10.000,00">
          <AmountInput className="h-11 text-lg font-semibold" autoFocus {...register('amount')} />
        </FormField>
        <FormField label="Fecha de pago" required error={errors.occurred_on?.message}>
          <Input type="date" className="h-11" {...register('occurred_on')} />
        </FormField>
      </div>

      <CategoryPathFields
        categories={categories}
        value={{ category_id: categoryId, item_id: itemId, category_type_id: typeId }}
        initial={defaultValues}
        errors={{
          category_id: errors.category_id?.message,
          item_id: errors.item_id?.message,
          category_type_id: errors.category_type_id?.message,
        }}
        onChange={(next) => {
          // Si ya se intentó enviar, se revalida al cambiar (para que el error desaparezca).
          const options = { shouldValidate: isSubmitted, shouldDirty: true }
          setValue('category_id', next.category_id, options)
          setValue('item_id', next.item_id, options)
          setValue('category_type_id', next.category_type_id, options)
        }}
      />

      <FormField label="Descripción (opcional)" error={errors.description?.message}>
        <Input placeholder="Ej.: Cuota 3 de 12" className="h-10" {...register('description')} />
      </FormField>

      <FormField label="Observaciones (opcional)" error={errors.notes?.message}>
        <Textarea rows={2} {...register('notes')} />
      </FormField>

      {allowFiles && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="comprobantes">Comprobantes (opcional)</Label>
          {/* Los archivos no son parte de los datos validados del formulario: se guardan aparte. */}
          <Input
            id="comprobantes"
            type="file"
            multiple
            accept={ACCEPTED_FILES}
            className="h-10 py-2"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <p className="text-muted-foreground text-xs">PDF, JPG, PNG o WEBP. Máximo 10 MB cada uno.</p>
          {fileErrors.map((message) => (
            <p key={message} className="text-destructive text-sm">
              {message}
            </p>
          ))}
          {files.length > 0 && (
            <ul className="flex flex-col gap-1">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-sm">
                  <Paperclip className="text-muted-foreground size-4" aria-hidden="true" />
                  <span className="truncate">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Quitar ${file.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" className="h-10" disabled={submitting}>
          {submitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
