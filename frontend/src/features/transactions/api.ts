import type {
  Attachment,
  Transaction,
  TransactionDetail,
  TransactionInput,
  TransactionPage,
  TransactionQuery,
} from '@/features/transactions/types'
import { apiRequest } from '@/lib/api'
import { shrinkImage } from '@/lib/shrinkImage'

export function toQueryString(query: TransactionQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export const listTransactions = (query: TransactionQuery) =>
  apiRequest<TransactionPage>(`/transactions${toQueryString(query)}`)

export const getTransaction = (id: string) => apiRequest<TransactionDetail>(`/transactions/${id}`)

export const createTransaction = (input: TransactionInput) =>
  apiRequest<Transaction>('/transactions', { method: 'POST', json: input })

export const updateTransaction = (id: string, input: TransactionInput) =>
  apiRequest<TransactionDetail>(`/transactions/${id}`, { method: 'PUT', json: input })

export const deleteTransaction = (id: string) =>
  apiRequest<void>(`/transactions/${id}`, { method: 'DELETE' })

export async function uploadAttachment(transactionId: string, file: File) {
  const form = new FormData()
  form.append('file', await shrinkImage(file))
  return apiRequest<Attachment>(`/transactions/${transactionId}/attachments`, {
    method: 'POST',
    form,
  })
}

export const deleteAttachment = (id: string) =>
  apiRequest<void>(`/attachments/${id}`, { method: 'DELETE' })

/** URL protegida por la sesión: solo funciona para integrantes del hogar. */
export const attachmentUrl = (id: string, download = false) =>
  `/api/attachments/${id}/content${download ? '?download=true' : ''}`
