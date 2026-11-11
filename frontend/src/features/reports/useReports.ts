import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as api from '@/features/reports/api'
import { TRANSACTIONS_KEY } from '@/features/transactions/useTransactions'
import type { Scope } from '@/lib/scope'

// Cuelgan de la clave de los pagos: al cargar, editar o borrar un pago (o pagar un
// vencimiento) se invalida TRANSACTIONS_KEY y los informes se recalculan solos.
const REPORTS_KEY = [...TRANSACTIONS_KEY, 'reports'] as const
const BUDGETS_KEY = [...TRANSACTIONS_KEY, 'budgets'] as const

export function useSummary(month: string, scope: Scope = 'mine') {
  return useQuery({
    queryKey: [...REPORTS_KEY, 'summary', month, scope],
    queryFn: () => api.getSummary(month, scope),
  })
}

export function useSpending(period: { month: string } | { year: number }, scope: Scope = 'mine') {
  return useQuery({
    queryKey: [...REPORTS_KEY, 'spending', period, scope],
    queryFn: () => api.getSpending(period, scope),
    // Al cambiar de mes o de año se sigue viendo el anterior hasta que llega el nuevo.
    placeholderData: (previous) => previous,
  })
}

export function useMonthly(params: Parameters<typeof api.getMonthly>[0], enabled = true) {
  return useQuery({
    queryKey: [...REPORTS_KEY, 'monthly', params],
    queryFn: () => api.getMonthly(params),
    enabled,
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
