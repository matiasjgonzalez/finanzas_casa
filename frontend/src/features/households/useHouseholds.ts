import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as api from '@/features/households/api'

const HOUSEHOLDS_KEY = ['households'] as const

export function useHouseholds() {
  return useQuery({ queryKey: HOUSEHOLDS_KEY, queryFn: api.listHouseholds })
}

export function useHousehold(id: string) {
  return useQuery({ queryKey: [...HOUSEHOLDS_KEY, id], queryFn: () => api.getHousehold(id) })
}

export function useCreateHousehold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.createHousehold,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HOUSEHOLDS_KEY }),
  })
}

export function useUpdateHousehold(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: api.HouseholdUpdateInput) => api.updateHousehold(id, input),
    onSuccess: (household) => {
      queryClient.setQueryData([...HOUSEHOLDS_KEY, id], household)
      queryClient.invalidateQueries({ queryKey: HOUSEHOLDS_KEY, exact: true })
    },
  })
}
