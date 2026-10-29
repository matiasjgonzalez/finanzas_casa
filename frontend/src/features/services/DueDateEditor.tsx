import { CircleAlert, LoaderCircle } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { AmountInput } from '@/components/form/AmountInput'
import { FormField } from '@/components/form/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import type { CatalogEntry, Category } from '@/features/catalog/api'
import {
  type AmountType,
  FREQUENCY_LABELS,
  type Frequency,
  type Service,
  type ServiceInput,
} from '@/features/services/api'
import { useServiceMutations } from '@/features/services/useServices'
import { amountToInput, parseAmountInput } from '@/lib/amount'
import { todayISO } from '@/lib/dates'

interface DueDateEditorProps {
  category: Category
  type: CatalogEntry
  /** El elemento (ej. el auto), en categorías con elementos y tipos. */
  item?: CatalogEntry | null
  /** Vencimiento ya programado para este tipo (y elemento), activo o desactivado. */
  service?: Service
  onSaved?: () => void
}

/**
 * ¿Tiene vencimiento? Si lo tiene: frecuencia, fecha e importe. Cada tipo con vencimiento
 * aparece en el calendario de vencimientos, y al pagarlo se registra en esa categoría y tipo.
 */
export function DueDateEditor({ category, type, item = null, service, onSaved }: DueDateEditorProps) {
  const { create, update } = useServiceMutations()
  const [enabled, setEnabled] = useState(service?.is_active ?? false)
  const [frequency, setFrequency] = useState<Frequency>(service?.frequency ?? 'monthly')
  const [dueDate, setDueDate] = useState(service?.first_due_date ?? todayISO())
  const [amountType, setAmountType] = useState<AmountType>(service?.amount_type ?? 'fixed')
  const [amount, setAmount] = useState(service?.estimated_amount ? amountToInput(service.estimated_amount) : '')
  const [errors, setErrors] = useState<{ dueDate?: string; amount?: string }>({})
  const busy = create.isPending || update.isPending
  const error = create.error ?? update.error

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = amount ? parseAmountInput(amount) : null
    const found: typeof errors = {}
    if (enabled && !dueDate) found.dueDate = 'Elegí la fecha de vencimiento.'
    if (enabled && amount && (parsed === null || Number(parsed) <= 0)) found.amount = 'Escribí el importe como 10.000,00.'
    else if (enabled && amountType === 'fixed' && !amount) found.amount = 'Con importe fijo, indicá el importe.'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    if (!enabled && !service?.is_active) return onSaved?.()
    const input: ServiceInput = {
      name: service?.name ?? [type.name, item?.name].filter(Boolean).join(' · '),
      provider: service?.provider ?? null,
      description: service?.description ?? null,
      notes: service?.notes ?? null,
      category_id: category.id,
      category_type_id: type.id,
      item_id: item?.id ?? null,
      frequency,
      first_due_date: dueDate,
      amount_type: amountType,
      estimated_amount: parsed,
      is_active: enabled,
    }
    try {
      if (service) await update.mutateAsync({ id: service.id, input })
      else await create.mutateAsync(input)
      toast.success(
        enabled
          ? `«${input.name}» tiene vencimiento: ya figura en el calendario.`
          : `«${input.name}» ya no tiene vencimiento. Los vencimientos pagados se conservan.`,
      )
      onSaved?.()
    } catch {
      // El mensaje queda a la vista en el formulario.
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-3">
        <Switch id={`vence-${type.id}-${item?.id ?? ''}`} checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor={`vence-${type.id}-${item?.id ?? ''}`}>Tiene vencimiento</Label>
      </div>

      {enabled && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Fecha de vencimiento"
              required
              error={errors.dueDate}
              hint="La primera; las siguientes se calculan con la frecuencia."
            >
              <Input type="date" className="h-10" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </FormField>
            <FormField label="Frecuencia" required>
              <NativeSelect
                className="w-full [&_select]:h-10"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
              >
                {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                  <NativeSelectOption key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Importe">
              <NativeSelect
                className="w-full [&_select]:h-10"
                value={amountType}
                onChange={(e) => setAmountType(e.target.value as AmountType)}
              >
                <NativeSelectOption value="fixed">Fijo (siempre el mismo)</NativeSelectOption>
                <NativeSelectOption value="variable">Variable (cambia cada vez)</NativeSelectOption>
              </NativeSelect>
            </FormField>
            <FormField
              label={amountType === 'fixed' ? 'Importe de cada vencimiento' : 'Importe estimado (opcional)'}
              required={amountType === 'fixed'}
              error={errors.amount}
              hint={amountType === 'variable' ? 'Se puede ajustar en cada vencimiento.' : undefined}
            >
              <AmountInput
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={(e) => setAmount(e.target.value)}
              />
            </FormField>
          </div>
        </>
      )}

      <Button type="submit" className="h-10 self-start" disabled={busy}>
        {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        Guardar
      </Button>
    </form>
  )
}
