import { createContext, useContext } from 'react'

/**
 * Qué usuarios se administran: los del propio hogar (administrador) o los de un hogar elegido
 * por el superadmin. Las mismas pantallas sirven para los dos casos.
 */
export interface UsersScope {
  /** Ruta de la API, ej. "/users" o "/households/<id>/users". */
  apiBase: string
  /** Pantalla con el listado, a donde se vuelve después de crear o editar. */
  home: string
  queryKey: readonly unknown[]
}

export const OWN_HOUSEHOLD_SCOPE: UsersScope = {
  apiBase: '/users',
  home: '/administracion',
  queryKey: ['users'],
}

export function householdScope(householdId: string): UsersScope {
  return {
    apiBase: `/households/${householdId}/users`,
    home: `/hogares/${householdId}`,
    queryKey: ['households', householdId, 'users'],
  }
}

export const UsersScopeContext = createContext<UsersScope>(OWN_HOUSEHOLD_SCOPE)

export const useUsersScope = () => useContext(UsersScopeContext)
