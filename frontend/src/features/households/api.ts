import { apiRequest } from '@/lib/api'

/** Lo que el superadmin ve de un hogar: ningún dato financiero. */
export interface HouseholdSummary {
  id: string
  name: string
  is_active: boolean
  created_at: string
  users_count: number
  admins_count: number
}

export interface HouseholdCreateInput {
  name: string
  admin_full_name: string
  admin_username: string
  admin_password: string
}

export type HouseholdUpdateInput = Partial<Pick<HouseholdSummary, 'name' | 'is_active'>>

export const listHouseholds = () => apiRequest<HouseholdSummary[]>('/households')

export const getHousehold = (id: string) => apiRequest<HouseholdSummary>(`/households/${id}`)

export const createHousehold = (input: HouseholdCreateInput) =>
  apiRequest<HouseholdSummary>('/households', { method: 'POST', json: input })

export const updateHousehold = (id: string, input: HouseholdUpdateInput) =>
  apiRequest<HouseholdSummary>(`/households/${id}`, { method: 'PATCH', json: input })
