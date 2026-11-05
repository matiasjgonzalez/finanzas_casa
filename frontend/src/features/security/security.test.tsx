import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { SecurityOverview } from '@/features/security/api'
import { describeDevice } from '@/features/security/device'
import { SecurityPage } from '@/features/security/SecurityPage'
import { jsonResponse, mockApi, renderWithProviders, SUPERADMIN_ME } from '@/test/utils'

describe('describeDevice', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36 Edg/142.0',
      'Edge en Windows',
    ],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36', 'Chrome en Windows'],
    ['Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36', 'Chrome en Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1', 'Safari en iPhone'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox en Mac'],
    ['python-requests/2.32', 'Otro programa'],
    [null, 'Desconocido'],
  ])('%s → %s', (agent, expected) => {
    expect(describeDevice(agent)).toBe(expected)
  })
})

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36'

const OVERVIEW: SecurityOverview = {
  summary: { days: 30, ok: 12, failed: 7, blocked: 2, unknown_user: 1, ips: 3 },
  locks: [{ kind: 'username', value: 'ana', failures: 5, unlock_at: '2026-11-05T23:45:00Z' }],
  suspicious_users: [{ username: 'ana', failures: 5 }],
  unknown_usernames: ['root'],
  new_ip_logins: 1,
  your_ip: '181.45.10.20',
  attempts: [
    {
      id: 3,
      created_at: '2026-11-05T23:30:00Z',
      username: 'ana',
      household: 'Familia Gonzalez',
      result: 'bad_password',
      ip_address: '45.9.9.9',
      user_agent: CHROME,
      new_ip: false,
    },
    {
      id: 2,
      created_at: '2026-11-05T22:00:00Z',
      username: 'root',
      household: null,
      result: 'unknown_user',
      ip_address: '45.9.9.9',
      user_agent: 'python-requests/2.32',
      new_ip: false,
    },
    {
      id: 1,
      created_at: '2026-11-05T21:00:00Z',
      username: 'leo',
      household: 'Familia Gonzalez',
      result: 'ok',
      ip_address: '181.45.10.20',
      user_agent: CHROME,
      new_ip: true,
    },
  ],
}

describe('Panel de seguridad', () => {
  it('muestra totales, tu IP, bloqueos, avisos e intentos', async () => {
    mockApi({ 'GET /api/security': () => jsonResponse(OVERVIEW) })

    renderWithProviders(<SecurityPage />, { me: SUPERADMIN_ME })

    expect(await screen.findByText('181.45.10.20', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('Intentos fallidos').parentElement).toHaveTextContent('7')
    expect(screen.getByText('Usuario «ana»')).toBeInTheDocument()
    const warnings = screen.getByRole('list', { name: 'Avisos' })
    expect(within(warnings).getByText(/«ana» tuvo 5 intentos fallidos/)).toBeInTheDocument()
    expect(within(warnings).getByText(/usuarios que no existen \(«root»\)/)).toBeInTheDocument()
    expect(within(warnings).getByText(/1 ingreso desde una IP nueva/)).toBeInTheDocument()

    const attempts = screen.getByRole('list', { name: 'Intentos de ingreso' })
    expect(within(attempts).getAllByRole('listitem')).toHaveLength(3)
    expect(within(attempts).getByText('Contraseña incorrecta')).toBeInTheDocument()
    expect(within(attempts).getAllByText(/Chrome en Windows/)).toHaveLength(2)
    expect(within(attempts).getByText(/IP nueva/)).toBeInTheDocument()
  })

  it('filtra por fallidos, por hogar y por usuario o IP', async () => {
    mockApi({ 'GET /api/security': () => jsonResponse(OVERVIEW) })
    renderWithProviders(<SecurityPage />, { me: SUPERADMIN_ME })
    const attempts = await screen.findByRole('list', { name: 'Intentos de ingreso' })

    await userEvent.click(screen.getByRole('button', { name: 'Solo fallidos' }))
    expect(within(attempts).getAllByRole('listitem')).toHaveLength(2)

    await userEvent.selectOptions(screen.getByLabelText('Hogar'), 'Usuario inexistente')
    expect(within(attempts).getAllByRole('listitem')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Todos' }))
    await userEvent.selectOptions(screen.getByLabelText('Hogar'), '')
    await userEvent.type(screen.getByLabelText('Usuario o IP'), '181.45')
    expect(within(attempts).getAllByRole('listitem')).toHaveLength(1)
    expect(within(attempts).getByText('leo')).toBeInTheDocument()
  })

  it('desbloquea una cuenta', async () => {
    let sent: unknown
    mockApi({
      // Después de desbloquear, el panel se vuelve a pedir y ya no tiene el bloqueo.
      'GET /api/security': () => jsonResponse(sent ? { ...OVERVIEW, locks: [] } : OVERVIEW),
      'POST /api/security/unlock': (init) => {
        sent = JSON.parse(String(init.body))
        return jsonResponse({ released: 5 })
      },
    })
    renderWithProviders(<SecurityPage />, { me: SUPERADMIN_ME })

    await userEvent.click(await screen.findByRole('button', { name: 'Desbloquear' }))

    expect(sent).toEqual({ username: 'ana' })
    expect(await screen.findByText('No hay cuentas ni IP bloqueadas.')).toBeInTheDocument()
  })
})
