import { apiRequest } from '@/lib/api'
import type { Scope } from '@/lib/scope'

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

/** Un renglón del detalle: categoría, elemento (ej. la camioneta) o tipo (ej. Nafta). */
export interface SpendingNode {
  /** null: pagos cargados sin tipo o sin elemento ("Sin especificar"). */
  id: string | null
  name: string
  total: string
  count: number
  children: SpendingNode[]
}

/** "Cuánto gastamos" de un mes o de un año. */
export interface Spending {
  period: 'month' | 'year'
  start: string
  end: string
  total: string
  count: number
  /** El mes anterior, o el año anterior. */
  previous_total: string
  /** Los 12 meses del gráfico: los del año, o los últimos 12 hasta el mes elegido. */
  months: MonthTotal[]
  categories: SpendingNode[]
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

/** Por defecto, los gastos de quien consulta; con scope 'household', los de todo el hogar (admin). */
export const getSummary = (month: string, scope?: Scope) =>
  apiRequest<Summary>(`/reports/summary${query({ month, scope })}`)

/** Con `month` ("2026-10") o con `year` (2026). */
export const getSpending = (period: { month: string } | { year: number }, scope?: Scope) =>
  apiRequest<Spending>(`/reports/spending${query({ ...period, scope })}`)

export const getMonthly = (params: {
  until?: string
  months?: number
  category_id?: string
  category_type_id?: string
  item_id?: string
  scope?: Scope
}) => apiRequest<MonthTotal[]>(`/reports/monthly${query(params)}`)

export interface BreakdownParams {
  group: Group
  date_from?: string
  date_to?: string
  category_id?: string
  scope?: Scope
}

export const getBreakdown = (params: BreakdownParams) =>
  apiRequest<GroupTotal[]>(`/reports/breakdown${query({ ...params })}`)

/** Enlace de descarga (lo resuelve el navegador con la cookie de sesión). */
export const exportUrl = (params: { date_from?: string; date_to?: string; scope?: Scope }) =>
  `/api/reports/export.csv${query(params)}`

export const listBudgets = (month: string) => apiRequest<Budget[]>(`/budgets${query({ month })}`)

export const setBudget = (categoryId: string, month: string, amount: string | null) =>
  apiRequest<void>(`/budgets/${categoryId}`, { method: 'PUT', json: { month, amount } })
