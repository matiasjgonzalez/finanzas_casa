import type { Me } from '@/features/auth/types'
import { ApiError, apiRequest } from '@/lib/api'

/** Usuario de la sesión actual, o null si no hay sesión. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await apiRequest<Me>('/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export function login(username: string, password: string): Promise<Me> {
  return apiRequest<Me>('/auth/login', { method: 'POST', json: { username, password } })
}

export function logout(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST' })
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiRequest<void>('/auth/change-password', {
    method: 'POST',
    json: { current_password: currentPassword, new_password: newPassword },
  })
}
