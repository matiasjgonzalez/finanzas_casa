import type { AuditLog } from '@/features/audit/api'
import { ROLE_LABELS } from '@/features/users/schemas'

const ACTION_LABELS: Record<string, string> = {
  'household.created': 'Creó el hogar',
  'auth.login': 'Inició sesión',
  'user.created': 'Creó un usuario',
  'user.updated': 'Modificó un usuario',
  'user.password_reset': 'Restableció una contraseña',
  'user.password_changed': 'Cambió su contraseña',
}

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Nombre',
  username: 'Usuario',
  role: 'Rol',
  is_active: 'Activo',
}

function formatValue(value: unknown): string {
  if (value === 'True') return 'sí'
  if (value === 'False') return 'no'
  if (value === 'admin' || value === 'member') return ROLE_LABELS[value].toLowerCase()
  return String(value)
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

/** Resumen legible de los detalles de una acción. */
export function describeDetails(log: AuditLog): string {
  const details = log.details
  if (!details) return ''
  if (log.action === 'user.created') return `${details.username} (${formatValue(details.role)})`
  if (log.action === 'household.created') return String(details.name ?? '')
  if (log.action === 'user.updated') {
    return Object.entries(details)
      .map(([field, change]) => {
        const { from, to } = change as { from: unknown; to: unknown }
        return `${FIELD_LABELS[field] ?? field}: ${formatValue(from)} → ${formatValue(to)}`
      })
      .join(' · ')
  }
  return ''
}
