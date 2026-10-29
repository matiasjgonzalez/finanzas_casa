import { CalendarClock } from 'lucide-react'
import { useState } from 'react'

import { FormField } from '@/components/form/FormField'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { type CatalogEntry, type Category, usesItems } from '@/features/catalog/api'
import { FREQUENCY_LABELS, type Service } from '@/features/services/api'
import { DueDateEditor } from '@/features/services/DueDateEditor'
import { formatDate } from '@/lib/format'

/** Vencimiento programado para un tipo (y elemento) concreto, si existe. */
function findDueDate(services: Service[], typeId: string, itemId: string | null = null) {
  return services.find((s) => s.category_type?.id === typeId && (s.item?.id ?? null) === itemId)
}

interface DueDateSheetProps {
  category: Category
  type: CatalogEntry | null
  services: Service[]
  onClose: () => void
}

/**
 * Panel lateral para indicar si un tipo tiene vencimiento. En categorías con elementos (ej.
 * Auto) cada elemento tiene el suyo: la patente de cada auto vence en fechas distintas.
 */
export function DueDateSheet({ category, type, services, onClose }: DueDateSheetProps) {
  const items = usesItems(category) ? category.items.filter((i) => i.is_active) : []
  const [itemId, setItemId] = useState(items[0]?.id ?? '')
  const item = items.find((i) => i.id === itemId) ?? items[0] ?? null
  const needsItem = usesItems(category)
  const itemLabel = (category.item_label ?? 'Elemento').toLowerCase()

  return (
    <Sheet open={type !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {type && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <CalendarClock className="size-4" aria-hidden="true" />
                Vencimiento de «{type.name}»
              </SheetTitle>
              <SheetDescription>
                {category.name} → {type.name}. Si tiene vencimiento, figura en el calendario de
                vencimientos y al pagarlo se registra en esta categoría.
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-6">
              {needsItem && items.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Primero agregá un {itemLabel} a «{category.name}».
                </p>
              ) : (
                <>
                  {needsItem && (
                    <>
                      <FormField label={category.item_label ?? 'Elemento'} required>
                        <NativeSelect
                          className="w-full [&_select]:h-10"
                          value={itemId}
                          onChange={(e) => setItemId(e.target.value)}
                        >
                          {items.map((i) => (
                            <NativeSelectOption key={i.id} value={i.id}>
                              {i.name}
                              {findDueDate(services, type.id, i.id)?.is_active ? ' (con vencimiento)' : ''}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </FormField>
                    </>
                  )}
                  <DueDateEditor
                    // Uno por tipo y elemento: al cambiar de elemento se carga el suyo.
                    key={`${type.id}-${item?.id ?? ''}`}
                    category={category}
                    type={type}
                    item={item}
                    service={findDueDate(services, type.id, item?.id ?? null)}
                    onSaved={needsItem ? undefined : onClose}
                  />
                  {needsItem && <ScheduledList services={services.filter((s) => s.category_type?.id === type.id)} />}
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ScheduledList({ services }: { services: Service[] }) {
  const active = services.filter((s) => s.is_active)
  if (active.length === 0) return null
  return (
    <div className="flex flex-col gap-1 border-t pt-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Con vencimiento</p>
      <ul className="text-sm">
        {active.map((s) => (
          <li key={s.id}>
            {s.item?.name}: {FREQUENCY_LABELS[s.frequency].toLowerCase()}
            {s.next_period && `, próximo ${formatDate(s.next_period.due_date)}`}
          </li>
        ))}
      </ul>
    </div>
  )
}
