import { describe, expect, it } from 'vitest'

import type { AuditLog } from '@/features/audit/api'
import { actionLabel, describeDetails } from '@/features/audit/describe'

const base: AuditLog = {
  id: 1,
  action: '',
  actor_name: 'Ana',
  entity_type: 'user',
  entity_id: 'u-1',
  details: null,
  ip_address: null,
  created_at: '2026-10-26T12:00:00Z',
}

describe('historial de acciones', () => {
  it('traduce las acciones conocidas', () => {
    expect(actionLabel('user.created')).toBe('Creó un usuario')
    expect(actionLabel('accion.desconocida')).toBe('accion.desconocida')
  })

  it('describe los cambios de un usuario en lenguaje claro', () => {
    const log = {
      ...base,
      action: 'user.updated',
      details: {
        role: { from: 'member', to: 'admin' },
        is_active: { from: 'True', to: 'False' },
      },
    }

    expect(describeDetails(log)).toBe('Rol: integrante → administrador · Activo: sí → no')
  })

  it('describe la creación de un usuario', () => {
    const log = { ...base, action: 'user.created', details: { username: 'leo', role: 'member' } }

    expect(describeDetails(log)).toBe('leo (integrante)')
  })
})
