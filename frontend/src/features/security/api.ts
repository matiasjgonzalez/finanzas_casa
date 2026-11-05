import { apiRequest } from '@/lib/api'

/** Cómo terminó un intento de ingreso. */
export type LoginResult = 'ok' | 'bad_password' | 'unknown_user' | 'disabled' | 'blocked' | 'failed'

export const RESULT_LABELS: Record<LoginResult, string> = {
  ok: 'Ingresó',
  bad_password: 'Contraseña incorrecta',
  unknown_user: 'Usuario inexistente',
  disabled: 'Cuenta u hogar desactivados',
  blocked: 'Rechazado (bloqueado)',
  failed: 'Falló',
}

export interface LoginAttempt {
  id: number
  created_at: string
  username: string
  /** Hogar de la cuenta ("Superadmin" para esa cuenta); null si el usuario no existe. */
  household: string | null
  result: LoginResult
  ip_address: string | null
  user_agent: string | null
  /** Ingreso correcto desde una IP que esa cuenta nunca había usado. */
  new_ip: boolean
}

export interface Lock {
  kind: 'username' | 'ip'
  value: string
  failures: number
  unlock_at: string
}

export interface SecurityOverview {
  summary: { days: number; ok: number; failed: number; blocked: number; unknown_user: number; ips: number }
  locks: Lock[]
  suspicious_users: { username: string; failures: number }[]
  unknown_usernames: string[]
  new_ip_logins: number
  attempts: LoginAttempt[]
  /** La IP con la que la app ve a quien mira el panel. */
  your_ip: string | null
}

export const getSecurity = () => apiRequest<SecurityOverview>('/security')

export const unlock = (target: { username: string } | { ip_address: string }) =>
  apiRequest<{ released: number }>('/security/unlock', { method: 'POST', json: target })
