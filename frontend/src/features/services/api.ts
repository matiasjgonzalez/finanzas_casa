import type { Attachment, NamedRef, Transaction } from '@/features/transactions/types'
import { apiRequest } from '@/lib/api'
import { shrinkImage } from '@/lib/shrinkImage'

export type Frequency = 'weekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'
export type AmountType = 'fixed' | 'variable'
/** "Vencido" lo calcula el backend: pendiente cuya fecha ya pasó. */
export type PeriodStatus = 'pending' | 'overdue' | 'paid'

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensual',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

export const STATUS_LABELS: Record<PeriodStatus, string> = {
  pending: 'Pendiente',
  overdue: 'Vencido',
  paid: 'Pagado',
}

export interface Service {
  id: string
  name: string
  provider: string | null
  description: string | null
  category: NamedRef
  category_type: NamedRef | null
  item: NamedRef | null
  amount_type: AmountType
  estimated_amount: string | null
  currency: string
  frequency: Frequency
  first_due_date: string
  is_active: boolean
  notes: string | null
  next_period: { id: string; due_date: string; amount_due: string | null; status: PeriodStatus } | null
}

export interface ServiceInput {
  name: string
  provider: string | null
  description: string | null
  category_id: string
  category_type_id: string | null
  item_id: string | null
  amount_type: AmountType
  estimated_amount: string | null
  frequency: Frequency
  first_due_date: string
  notes: string | null
  is_active: boolean
}

export interface Period {
  id: string
  service: {
    id: string
    name: string
    provider: string | null
    amount_type: AmountType
    frequency: Frequency
    is_active: boolean
  }
  category: NamedRef
  category_type: NamedRef | null
  item: NamedRef | null
  due_date: string
  amount_due: string | null
  currency: string
  status: PeriodStatus
  paid_on: string | null
  amount_paid: string | null
  transaction_id: string | null
  paid_by: { id: string; full_name: string } | null
  notes: string | null
  attachments_count: number
  updated_at: string
}

export interface PeriodDetail extends Period {
  attachments: Attachment[]
}

export interface Alerts {
  overdue: number
  due_soon: number
  days: number
  items: Period[]
}

export type PayInput =
  | { mode: 'create'; paid_on: string; amount: string | null }
  | { mode: 'link'; transaction_id: string }

const inactive = (include: boolean) => (include ? '?include_inactive=true' : '')

export const listServices = (includeInactive = false) =>
  apiRequest<Service[]>(`/services${inactive(includeInactive)}`)
export const getService = (id: string) => apiRequest<Service>(`/services/${id}`)
export const createService = (input: ServiceInput) =>
  apiRequest<Service>('/services', { method: 'POST', json: input })
export const updateService = (id: string, input: ServiceInput) =>
  apiRequest<Service>(`/services/${id}`, { method: 'PUT', json: input })
export const serviceHistory = (id: string) => apiRequest<Period[]>(`/services/${id}/periods`)

export const listPeriods = (dateFrom: string, dateTo: string) =>
  apiRequest<Period[]>(`/service-periods?date_from=${dateFrom}&date_to=${dateTo}`)
export const getAlerts = (days = 7) => apiRequest<Alerts>(`/service-periods/alerts?days=${days}`)
export const getPeriod = (id: string) => apiRequest<PeriodDetail>(`/service-periods/${id}`)
export const updatePeriod = (id: string, input: { amount_due?: string | null; notes?: string | null }) =>
  apiRequest<PeriodDetail>(`/service-periods/${id}`, { method: 'PATCH', json: input })
export const payPeriod = (id: string, input: PayInput) =>
  apiRequest<PeriodDetail>(`/service-periods/${id}/pay`, { method: 'POST', json: input })
export const unpayPeriod = (id: string, deletePayment: boolean) =>
  apiRequest<PeriodDetail>(`/service-periods/${id}/unpay`, {
    method: 'POST',
    json: { delete_payment: deletePayment },
  })
export const linkCandidates = (id: string) =>
  apiRequest<Transaction[]>(`/service-periods/${id}/candidates`)

export async function uploadPeriodAttachment(periodId: string, file: File) {
  const form = new FormData()
  form.append('file', await shrinkImage(file))
  return apiRequest<Attachment>(`/service-periods/${periodId}/attachments`, {
    method: 'POST',
    form,
  })
}

/** "Servicio · Luz" o "Auto · Fiat Cronos · Patente" */
export function periodPath(p: Pick<Period, 'category' | 'item' | 'category_type'>): string {
  return [p.category.name, p.item?.name, p.category_type?.name].filter(Boolean).join(' · ')
}
