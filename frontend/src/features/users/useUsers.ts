import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ME_QUERY_KEY } from '@/features/auth/useAuth'
import * as usersApi from '@/features/users/api'
import { useUsersScope } from '@/features/users/scope'

export function useUsers() {
  const { apiBase, queryKey } = useUsersScope()
  return useQuery({ queryKey, queryFn: () => usersApi.listUsers(apiBase) })
}

export function useUser(id: string) {
  const { apiBase, queryKey } = useUsersScope()
  return useQuery({ queryKey: [...queryKey, id], queryFn: () => usersApi.getUser(apiBase, id) })
}

/** Además del listado, se refrescan los contadores de hogares (lo que ve el superadmin). */
function useInvalidateUsers() {
  const queryClient = useQueryClient()
  const { queryKey } = useUsersScope()
  return () => {
    queryClient.invalidateQueries({ queryKey })
    if (queryKey[0] === 'households') queryClient.invalidateQueries({ queryKey: ['households'] })
  }
}

export function useCreateUser() {
  const { apiBase } = useUsersScope()
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (input: usersApi.UserCreateInput) => usersApi.createUser(apiBase, input),
    onSuccess: invalidate,
  })
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient()
  const { apiBase, queryKey } = useUsersScope()
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (input: usersApi.UserUpdateInput) => usersApi.updateUser(apiBase, id, input),
    onSuccess: (user) => {
      queryClient.setQueryData([...queryKey, id], user)
      invalidate()
      // Si el administrador se editó a sí mismo (nombre, rol), se actualiza la sesión.
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
    },
  })
}

export function useResetPassword(id: string) {
  const { apiBase } = useUsersScope()
  return useMutation({
    mutationFn: (password: string) => usersApi.resetPassword(apiBase, id, password),
  })
}
