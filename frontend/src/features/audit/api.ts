import { apiRequest } from '@/lib/api'
import type { Page } from '@/lib/types'

export interface AuditLog {
  id: number
  action: string
  actor_name: string | null
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export const listAuditLogs = (page: number, pageSize: number) =>
  apiRequest<Page<AuditLog>>(`/audit-logs?page=${page}&page_size=${pageSize}`)
