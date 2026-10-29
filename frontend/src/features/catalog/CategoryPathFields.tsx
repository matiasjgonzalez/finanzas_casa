import { FormField } from '@/components/form/FormField'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { type CatalogEntry, type Category, usesItems, usesTypes } from '@/features/catalog/api'

export interface CategoryPath {
  category_id: string
  item_id: string
  category_type_id: string
}

interface CategoryPathFieldsProps {
  categories: Category[]
  value: CategoryPath
  onChange: (next: CategoryPath) => void
  errors?: Partial<Record<keyof CategoryPath, string | undefined>>
  /** Valores que ya tenía el registro: se muestran aunque hoy estén desactivados. */
  initial?: CategoryPath
}

/** Activos, más el que ya tenía el registro aunque esté desactivado (para no perder el dato). */
function visible(entries: CatalogEntry[], currentId: string | undefined): CatalogEntry[] {
  return entries.filter((e) => e.is_active || e.id === currentId)
}

/**
 * Selectores encadenados categoría → elemento (ej. auto) → tipo, según la estructura de la
 * categoría elegida. Los usan los formularios de pagos y de servicios.
 */
export function CategoryPathFields({
  categories,
  value,
  onChange,
  errors = {},
  initial,
}: CategoryPathFieldsProps) {
  const category = categories.find((c) => c.id === value.category_id)
  const itemLabel = category?.item_label ?? 'Elemento'

  return (
    <>
      <FormField label="Categoría" required error={errors.category_id}>
        <NativeSelect
          className="w-full [&_select]:h-10"
          value={value.category_id}
          // Al cambiar de categoría, el tipo y el elemento elegidos ya no corresponden.
          onChange={(e) => onChange({ category_id: e.target.value, item_id: '', category_type_id: '' })}
        >
          <NativeSelectOption value="">Elegí una categoría</NativeSelectOption>
          {categories
            .filter((c) => c.is_active || c.id === initial?.category_id)
            .map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
        </NativeSelect>
      </FormField>

      {category && category.structure !== 'simple' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {usesItems(category) && (
            <FormField label={itemLabel} required error={errors.item_id}>
              <NativeSelect
                className="w-full [&_select]:h-10"
                value={value.item_id}
                onChange={(e) => onChange({ ...value, item_id: e.target.value })}
              >
                <NativeSelectOption value="">Elegí {itemLabel.toLowerCase()}</NativeSelectOption>
                {visible(category.items, initial?.item_id).map((i) => (
                  <NativeSelectOption key={i.id} value={i.id}>
                    {i.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
          )}
          {usesTypes(category) && (
            <FormField label="Tipo" required error={errors.category_type_id}>
              <NativeSelect
                className="w-full [&_select]:h-10"
                value={value.category_type_id}
                onChange={(e) => onChange({ ...value, category_type_id: e.target.value })}
              >
                <NativeSelectOption value="">Elegí un tipo</NativeSelectOption>
                {visible(category.types, initial?.category_type_id).map((t) => (
                  <NativeSelectOption key={t.id} value={t.id}>
                    {t.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
          )}
          {((usesItems(category) && category.items.length === 0) ||
            (usesTypes(category) && category.types.length === 0)) && (
            <p className="text-muted-foreground text-xs sm:col-span-2">
              Esta categoría todavía no tiene opciones cargadas. Un administrador las agrega en
              Administración → Categorías.
            </p>
          )}
        </div>
      )}
    </>
  )
}
