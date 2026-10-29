import { ChoiceTiles } from '@/components/form/ChoiceTiles'
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

const NO_OPTIONS =
  'Todavía no hay opciones cargadas. Un administrador las agrega en Administración → Categorías.'

/**
 * Categoría → elemento (ej. auto) → tipo, eligiendo con botones grandes. Cada paso aparece
 * recién cuando el anterior está elegido.
 */
export function CategoryPathFields({ categories, value, onChange, errors = {}, initial }: CategoryPathFieldsProps) {
  const category = categories.find((c) => c.id === value.category_id)
  const itemLabel = category?.item_label ?? 'Elemento'

  return (
    <>
      <ChoiceTiles
        label="Categoría"
        required
        error={errors.category_id}
        value={value.category_id}
        // Al cambiar de categoría, el tipo y el elemento elegidos ya no corresponden.
        onChange={(id) => onChange({ category_id: id, item_id: '', category_type_id: '' })}
        options={categories
          .filter((c) => c.is_active || c.id === initial?.category_id)
          .map((c) => ({ value: c.id, label: c.name }))}
        empty={NO_OPTIONS}
      />
      {category && usesItems(category) && (
        <ChoiceTiles
          label={itemLabel}
          required
          error={errors.item_id}
          value={value.item_id}
          onChange={(id) => onChange({ ...value, item_id: id })}
          options={visible(category.items, initial?.item_id).map((i) => ({ value: i.id, label: i.name }))}
          empty={NO_OPTIONS}
        />
      )}
      {category && usesTypes(category) && (
        <ChoiceTiles
          label="Tipo"
          required
          error={errors.category_type_id}
          value={value.category_type_id}
          onChange={(id) => onChange({ ...value, category_type_id: id })}
          options={visible(category.types, initial?.category_type_id).map((t) => ({ value: t.id, label: t.name }))}
          empty={NO_OPTIONS}
        />
      )}
    </>
  )
}
