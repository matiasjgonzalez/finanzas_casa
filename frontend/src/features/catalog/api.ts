import { apiRequest } from '@/lib/api'

export type CategoryStructure = 'simple' | 'types' | 'items_and_types'

/** Tipo (ej. "Visa") o elemento (ej. "Fiat Cronos") de una categoría. */
export interface CatalogEntry {
  id: string
  name: string
  is_active: boolean
}

export interface Category {
  id: string
  name: string
  structure: CategoryStructure
  /** Cómo se llama cada elemento (ej. "Auto"). Solo con estructura items_and_types. */
  item_label: string | null
  is_active: boolean
  types: CatalogEntry[]
  items: CatalogEntry[]
}

export const STRUCTURE_LABELS: Record<CategoryStructure, string> = {
  simple: 'Sin subdivisión',
  types: 'Con tipos',
  items_and_types: 'Con elementos y tipos',
}

export const STRUCTURE_HINTS: Record<CategoryStructure, string> = {
  simple: 'Ej.: Supermercado. Al cargar un pago solo se elige la categoría.',
  types: 'Ej.: Tarjeta de crédito → Visa, Mastercard. Al cargar se elige el tipo.',
  items_and_types:
    'Ej.: Auto → cada auto (Fiat Cronos, Ford Ka) y tipos comunes (Seguro, Patente). Al cargar se elige el auto y el tipo.',
}

export const usesTypes = (c: Pick<Category, 'structure'>) => c.structure !== 'simple'
export const usesItems = (c: Pick<Category, 'structure'>) => c.structure === 'items_and_types'

export type EntryKind = 'type' | 'item'

/** "Auto" → "Autos", "Camión" → "Camiones" (aproximado, alcanza para títulos). */
export function plural(word: string): string {
  if (/[aeiouáéíóú]$/i.test(word)) return `${word}s`
  return `${word.replace(/ó(n)$/i, 'o$1')}es`
}

export const listCategories = (includeInactive = false) =>
  apiRequest<Category[]>(`/categories${includeInactive ? '?include_inactive=true' : ''}`)

export const createCategory = (input: { name: string; structure: CategoryStructure }) =>
  apiRequest<Category>('/categories', { method: 'POST', json: input })

export const updateCategory = (
  id: string,
  input: Partial<Pick<Category, 'name' | 'is_active' | 'structure' | 'item_label'>>,
) => apiRequest<Category>(`/categories/${id}`, { method: 'PATCH', json: input })

export const createEntry = (kind: EntryKind, categoryId: string, name: string) =>
  apiRequest<CatalogEntry>(`/categories/${categoryId}/${kind === 'type' ? 'types' : 'items'}`, {
    method: 'POST',
    json: { name },
  })

export const updateEntry = (
  kind: EntryKind,
  id: string,
  input: Partial<Pick<CatalogEntry, 'name' | 'is_active'>>,
) =>
  apiRequest<CatalogEntry>(`/${kind === 'type' ? 'category-types' : 'category-items'}/${id}`, {
    method: 'PATCH',
    json: input,
  })
