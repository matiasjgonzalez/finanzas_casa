/** superadmin: administra los hogares; no pertenece a ninguno ni ve sus datos. */
export type UserRole = 'superadmin' | 'admin' | 'member'
export type HouseholdRole = Exclude<UserRole, 'superadmin'>

export interface User {
  id: string
  username: string
  full_name: string
  role: UserRole
  is_active: boolean
  /** La contraseña fue asignada por otra persona: hay que cambiarla antes de usar la app. */
  must_change_password: boolean
  last_login_at: string | null
  created_at: string
}

export interface Household {
  id: string
  name: string
  currency: string
}

export interface Me {
  user: User
  /** null para el superadmin. */
  household: Household | null
}
