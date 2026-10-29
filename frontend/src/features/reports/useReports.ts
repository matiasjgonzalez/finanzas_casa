import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as api from '@/features/reports/api'
import { TRANSACTIONS_KEY } from '@/features/transactions/useTransactions'

// Cuelgan de la clave de los pagos: al cargar, editar o borrar un pago (o pagar un
// vencimiento) se invalida TRANSACTIONS_KEY y los informes se recalculan solos.
const REPORTS_KEY = [...TRANSACTIONS_KEY, 'reports'] as const
const BUDGETS_KEY = [...TRANSACTIONS_KEY, 'budgets'] as const

export function useSummary(month: string) {
  return useQuery({ queryKey: [...REPORTS_KEY, 'summary', month], queryFn: () => api.getSummary(month) })
}

export function useMonthly(params: Parameters<typeof api.getMonthly>[0]) {
  return useQuery({ queryKey: [...REPORTS_KEY, 'monthly', params], queryFn: () => api.getMonthly(params) })
}

export function useMonthlyGrouped(params: Parameters<typeof api.getMonthlyGrouped>[0]) {
  return useQuery({
    queryKey: [...REPORTS_KEY, 'monthly-grouped', params],
    queryFn: () => api.getMonthlyGrouped(params),
  })
}

export function useDaily(month: string) {
  return useQuery({ queryKey: [...REPORTS_KEY, 'daily', month], queryFn: () => api.getDaily(month) })
}

export function usePatterns(params: Parameters<typeof api.getPatterns>[0]) {
  return useQuery({ queryKey: [...REPORTS_KEY, 'patterns', params], queryFn: () => api.getPatterns(params) })
}

export function usePunctuality(months: number) {
  return useQuery({
    queryKey: [...REPORTS_KEY, 'punctuality', months],
    queryFn: () => api.getPunctuality({ months }),
  })
}

export function useProjection(month: string) {
  return useQuery({ queryKey: [...REPORTS_KEY, 'projection', month], queryFn: () => api.getProjection(month) })
}

export function useBudgetHistory(categoryId: string | null) {
  return useQuery({
    queryKey: [...BUDGETS_KEY, 'history', categoryId],
    queryFn: () => api.getBudgetHistory(categoryId!, { months: 12 }),
    enabled: !!categoryId,
  })
}

export function useBreakdown(params: api.BreakdownParams, enabled = true) {
  return useQuery({
    queryKey: [...REPORTS_KEY, 'breakdown', params],
    queryFn: () => api.getBreakdown(params),
    enabled,
  })
}

export function useBudgets(month: string) {
  return useQuery({ queryKey: [...BUDGETS_KEY, month], queryFn: () => api.listBudgets(month) })
}

export function useSetBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ categoryId, month, amount }: { categoryId: string; month: string; amount: string | null }) =>
      api.setBudget(categoryId, month, amount),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGETS_KEY }),
  })
}
