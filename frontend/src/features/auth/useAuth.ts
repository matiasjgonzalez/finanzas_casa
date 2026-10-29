import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as authApi from '@/features/auth/api'
import type { Me } from '@/features/auth/types'

export const ME_QUERY_KEY = ['auth', 'me'] as const

/** Sesión actual. data === null significa "no hay sesión iniciada". */
export function useMe() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: authApi.fetchMe, staleTime: 5 * 60_000 })
}

/** Usuario actual; solo usar dentro de rutas protegidas (RequireAuth garantiza que existe). */
export function useCurrentUser() {
  const { data } = useMe()
  if (!data) throw new Error('useCurrentUser se usó fuera de una ruta protegida')
  return {
    ...data,
    isAdmin: data.user.role === 'admin',
    isSuperadmin: data.user.role === 'superadmin',
  }
}

/**
 * Cambia la sesión guardada y descarta los datos de cualquier sesión anterior.
 *
 * No se usa queryClient.clear(): eso también desconectaría a los componentes que ya están
 * escuchando la sesión (por ejemplo, la pantalla de login) y no verían el cambio.
 */
function replaceSession(queryClient: QueryClient, me: Me | null) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] })
  queryClient.setQueryData(ME_QUERY_KEY, me)
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authApi.login(username, password),
    onSuccess: (me) => replaceSession(queryClient, me),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: authApi.logout,
    // Aunque la API falle, en este navegador se olvidan todos los datos del usuario.
    onSettled: () => replaceSession(queryClient, null),
  })
}
