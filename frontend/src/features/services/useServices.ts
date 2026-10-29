import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as api from '@/features/services/api'
import { TRANSACTIONS_KEY } from '@/features/transactions/useTransactions'

export const SERVICES_KEY = ['services'] as const
export const PERIODS_KEY = ['service-periods'] as const

export function useServices(includeInactive = false) {
  return useQuery({
    queryKey: [...SERVICES_KEY, { includeInactive }],
    queryFn: () => api.listServices(includeInactive),
  })
}

export function useService(id: string) {
  return useQuery({ queryKey: [...SERVICES_KEY, 'detail', id], queryFn: () => api.getService(id) })
}

export function useServiceHistory(id: string) {
  return useQuery({ queryKey: [...PERIODS_KEY, 'history', id], queryFn: () => api.serviceHistory(id) })
}

export function usePeriods(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: [...PERIODS_KEY, 'range', dateFrom, dateTo],
    queryFn: () => api.listPeriods(dateFrom, dateTo),
  })
}

/** Recordatorios para el menú: se actualizan cada 5 minutos mientras la app está abierta. */
export function useAlerts(days = 7, enabled = true) {
  return useQuery({
    enabled,
    queryKey: [...PERIODS_KEY, 'alerts', days],
    queryFn: () => api.getAlerts(days),
    refetchInterval: 5 * 60_000,
  })
}

export function usePeriod(id: string) {
  return useQuery({ queryKey: [...PERIODS_KEY, 'detail', id], queryFn: () => api.getPeriod(id) })
}

export function useLinkCandidates(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...PERIODS_KEY, 'candidates', id],
    queryFn: () => api.linkCandidates(id),
    enabled,
  })
}

/** Pagar o anular un vencimiento también cambia Pagos: se refrescan ambos. */
function useInvalidateAll() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: PERIODS_KEY }),
      queryClient.invalidateQueries({ queryKey: SERVICES_KEY }),
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY }),
    ])
}

export function useServiceMutations() {
  const invalidate = useInvalidateAll()
  return {
    create: useMutation({ mutationFn: api.createService, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: api.ServiceInput }) =>
        api.updateService(id, input),
      onSuccess: invalidate,
    }),
  }
}

export function usePeriodMutations(id: string) {
  const invalidate = useInvalidateAll()
  return {
    update: useMutation({
      mutationFn: (input: Parameters<typeof api.updatePeriod>[1]) => api.updatePeriod(id, input),
      onSuccess: invalidate,
    }),
    pay: useMutation({ mutationFn: (input: api.PayInput) => api.payPeriod(id, input), onSuccess: invalidate }),
    unpay: useMutation({
      mutationFn: (deletePayment: boolean) => api.unpayPeriod(id, deletePayment),
      onSuccess: invalidate,
    }),
    upload: useMutation({
      mutationFn: (file: File) => api.uploadPeriodAttachment(id, file),
      onSuccess: invalidate,
    }),
  }
}
