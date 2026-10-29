import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as catalogApi from '@/features/catalog/api'

const CATEGORIES_KEY = ['categories'] as const

/** Las categorías cambian poco: se guardan 5 minutos sin volver a pedirlas. */
export function useCategories(includeInactive = false) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, { includeInactive }],
    queryFn: () => catalogApi.listCategories(includeInactive),
    staleTime: 5 * 60_000,
  })
}

export function useCatalogMutations() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY })

  return {
    createCategory: useMutation({ mutationFn: catalogApi.createCategory, onSuccess: refresh }),
    updateCategory: useMutation({
      mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof catalogApi.updateCategory>[1]) =>
        catalogApi.updateCategory(id, input),
      onSuccess: refresh,
    }),
    createEntry: useMutation({
      mutationFn: (v: { kind: catalogApi.EntryKind; categoryId: string; name: string }) =>
        catalogApi.createEntry(v.kind, v.categoryId, v.name),
      onSuccess: refresh,
    }),
    updateEntry: useMutation({
      mutationFn: ({
        kind,
        id,
        ...input
      }: { kind: catalogApi.EntryKind; id: string; name?: string; is_active?: boolean }) =>
        catalogApi.updateEntry(kind, id, input),
      onSuccess: refresh,
    }),
  }
}
