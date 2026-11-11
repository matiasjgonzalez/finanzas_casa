import { useSearchParams } from 'react-router'

import type { TransactionQuery } from '@/features/transactions/types'
import { type PeriodPreset, periodRange } from '@/lib/dates'

export const PAGE_SIZE = 10

export interface FilterState {
  period: PeriodPreset | 'custom'
  from: string
  to: string
  category: string
  item: string
  type: string
  user: string
  /** 'hogar': la pestaña "Gastos del hogar" (solo admin). */
  vista: string
  q: string
  sort: NonNullable<TransactionQuery['sort']>
  order: NonNullable<TransactionQuery['order']>
  page: number
}

const DEFAULTS: FilterState = {
  period: 'this-month',
  from: '',
  to: '',
  category: '',
  item: '',
  type: '',
  user: '',
  vista: '',
  q: '',
  sort: 'date',
  order: 'desc',
  page: 1,
}

/**
 * Los filtros viven en la URL (?period=…&category=…): se pueden compartir, sobreviven a recargar
 * la página y el botón "Atrás" del navegador vuelve a los filtros anteriores.
 */
export function useTransactionFilters() {
  const [params, setParams] = useSearchParams()

  const state: FilterState = {
    ...DEFAULTS,
    ...Object.fromEntries(params.entries()),
    page: Math.max(1, Number(params.get('page') ?? 1) || 1),
  } as FilterState

  const update = (changes: Partial<FilterState>) => {
    const next = { ...state, ...changes }
    // Cualquier cambio de filtro vuelve a la primera página.
    if (!('page' in changes)) next.page = 1
    // El tipo y el elemento dependen de la categoría.
    if ('category' in changes && changes.category !== state.category) {
      next.item = ''
      next.type = ''
    }
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(next)) {
      if (value !== '' && value !== DEFAULTS[key as keyof FilterState]) search.set(key, String(value))
    }
    setParams(search, { replace: true })
  }

  // Limpiar los filtros no cambia de pestaña.
  const reset = () => setParams(state.vista ? { vista: state.vista } : new URLSearchParams(), { replace: true })

  return { state, update, reset, query: toQuery(state) }
}

export function toQuery(state: FilterState): TransactionQuery {
  const range =
    state.period === 'custom'
      ? { from: state.from || undefined, to: state.to || undefined }
      : periodRange(state.period)
  return {
    date_from: range.from,
    date_to: range.to,
    category_id: state.category || undefined,
    item_id: state.item || undefined,
    category_type_id: state.type || undefined,
    // Filtrar por persona solo tiene sentido en "Gastos del hogar".
    created_by_id: (state.vista === 'hogar' && state.user) || undefined,
    scope: state.vista === 'hogar' ? 'household' : undefined,
    q: state.q.trim() || undefined,
    sort: state.sort,
    order: state.order,
    page: state.page,
    page_size: PAGE_SIZE,
  }
}

export function activeFilterCount(state: FilterState): number {
  return [state.category, state.item, state.type, state.user, state.q].filter(Boolean).length
}
