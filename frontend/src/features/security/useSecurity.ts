import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as api from '@/features/security/api'

const SECURITY_KEY = ['security'] as const

export function useSecurity() {
  // Se actualiza solo cada minuto mientras el panel está abierto.
  return useQuery({ queryKey: SECURITY_KEY, queryFn: api.getSecurity, refetchInterval: 60_000 })
}

export function useUnlock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.unlock,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SECURITY_KEY }),
  })
}
