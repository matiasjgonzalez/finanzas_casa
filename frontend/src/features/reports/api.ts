import { apiRequest } from '@/lib/api'

/** Total de un grupo: una categoría, un tipo, un elemento (ej. auto) o un integrante. */
export interface GroupTotal {
  /** null: pagos sin tipo o sin elemento. */
  id: string | null
  name: string
  total: string
  count: number
}

export interface MonthTotal {
  /** Primer día del mes ("2026-10-01"). */
  month: string
  total: string
  count: number
}

export interface Summary {
  month: string
  total: string
  count: number
  previous_total: string
  by_category: GroupTotal[]
}

export type Group = 'category' | 'type' | 'item' | 'member'

export type BudgetStatus = 'ok' | 'warning' | 'exceeded'

export interface Budget {
  category: { id: string; name: string }
  amount: string
  spent: string
  /** Mes desde el que rige este límite ("2026-10-01"). */
  since: string
  status: BudgetStatus
}

function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const getSummary = (month: string) => apiRequest<Summary>(`/reports/summary${query({ month })}`)

export const getMonthly = (params: {
  until?: string
  months?: number
  category_id?: string
  category_type_id?: string
  item_id?: string
}) => apiRequest<MonthTotal[]>(`/reports/monthly${query(params)}`)

export interface BreakdownParams {
  group: Group
  date_from?: string
  date_to?: string
  category_id?: string
}

export const getBreakdown = (params: BreakdownParams) =>
  apiRequest<GroupTotal[]>(`/reports/breakdown${query({ ...params })}`)

/** Enlace de descarga (lo resuelve el navegador con la cookie de sesión). */
export const exportUrl = (params: { date_from?: string; date_to?: string }) =>
  `/api/reports/export.csv${query(params)}`

export const listBudgets = (month: string) => apiRequest<Budget[]>(`/budgets${query({ month })}`)

export const setBudget = (categoryId: string, month: string, amount: string | null) =>
  apiRequest<void>(`/budgets/${categoryId}`, { method: 'PUT', json: { month, amount } })
