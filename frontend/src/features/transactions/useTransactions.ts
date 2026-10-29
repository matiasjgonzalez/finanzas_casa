import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as api from '@/features/transactions/api'
import type { TransactionInput, TransactionQuery } from '@/features/transactions/types'

export const TRANSACTIONS_KEY = ['transactions'] as const

export function useTransactionList(query: TransactionQuery) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, 'list', query],
    queryFn: () => api.listTransactions(query),
    // Al cambiar filtros o de página se sigue viendo la lista anterior hasta que llega la nueva.
    placeholderData: keepPreviousData,
  })
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, 'detail', id],
    queryFn: () => api.getTransaction(id),
  })
}

/** Cualquier cambio en pagos invalida listados, detalles (y más adelante, el dashboard). */
function useInvalidateTransactions() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
}

export function useCreateTransaction() {
  const invalidate = useInvalidateTransactions()
  return useMutation({ mutationFn: api.createTransaction, onSuccess: invalidate })
}

export function useUpdateTransaction(id: string) {
  const invalidate = useInvalidateTransactions()
  return useMutation({
    mutationFn: (input: TransactionInput) => api.updateTransaction(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateTransactions()
  return useMutation({ mutationFn: api.deleteTransaction, onSuccess: invalidate })
}

export function useUploadAttachment(transactionId: string) {
  const invalidate = useInvalidateTransactions()
  return useMutation({
    mutationFn: (file: File) => api.uploadAttachment(transactionId, file),
    onSuccess: invalidate,
  })
}

export function useDeleteAttachment() {
  const invalidate = useInvalidateTransactions()
  return useMutation({ mutationFn: api.deleteAttachment, onSuccess: invalidate })
}
