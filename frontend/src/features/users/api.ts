import type { HouseholdRole, User } from '@/features/auth/types'
import { apiRequest } from '@/lib/api'

export interface UserCreateInput {
  username: string
  full_name: string
  password: string
  role: HouseholdRole
}

export type UserUpdateInput = Partial<
  Pick<User, 'username' | 'full_name' | 'is_active'> & { role: HouseholdRole }
>

// `base` es "/users" (el propio hogar) o "/households/<id>/users" (superadmin): ver scope.ts.

export const listUsers = (base: string) => apiRequest<User[]>(base)

/** Integrantes del hogar (solo nombre). Lo puede consultar cualquier integrante. */
export const listMembers = () =>
  apiRequest<{ id: string; full_name: string; is_active: boolean }[]>('/members')

export const getUser = (base: string, id: string) => apiRequest<User>(`${base}/${id}`)

export const createUser = (base: string, input: UserCreateInput) =>
  apiRequest<User>(base, { method: 'POST', json: input })

export const updateUser = (base: string, id: string, input: UserUpdateInput) =>
  apiRequest<User>(`${base}/${id}`, { method: 'PATCH', json: input })

export const resetPassword = (base: string, id: string, newPassword: string) =>
  apiRequest<void>(`${base}/${id}/reset-password`, {
    method: 'POST',
    json: { new_password: newPassword },
  })
