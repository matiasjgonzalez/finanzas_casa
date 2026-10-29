import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'

import type { Me } from '@/features/auth/types'
import { ME_QUERY_KEY } from '@/features/auth/useAuth'

export const ADMIN_ME: Me = {
  user: {
    id: 'u-admin',
    username: 'ana',
    full_name: 'Ana Pérez',
    role: 'admin',
    is_active: true,
    must_change_password: false,
    last_login_at: null,
    created_at: '2026-10-01T12:00:00Z',
  },
  household: { id: 'h-1', name: 'Familia Pérez', currency: 'ARS' },
}

export const MEMBER_ME: Me = {
  ...ADMIN_ME,
  user: { ...ADMIN_ME.user, id: 'u-member', username: 'leo', full_name: 'Leo Pérez', role: 'member' },
}

export const SUPERADMIN_ME: Me = {
  user: { ...ADMIN_ME.user, id: 'u-super', username: 'admin', full_name: 'Administrador', role: 'superadmin' },
  household: null,
}

interface RenderOptions {
  route?: string | { pathname: string; state?: unknown }
  /** Sesión ya cargada (undefined = sin cargar, null = sin sesión). */
  me?: Me | null
}

/** Renderiza con un QueryClient nuevo (sin caché compartida ni reintentos) y un router en memoria. */
export function renderWithProviders(ui: ReactElement, { route = '/', me }: RenderOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (me !== undefined) queryClient.setQueryData(ME_QUERY_KEY, me)
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...result, queryClient }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Handler = (init: RequestInit) => Response
/**
 * Simula la API: cada clave es "MÉTODO /ruta" (ej. "POST /api/auth/login").
 * Una ruta no prevista hace fallar la prueba, para no ocultar peticiones inesperadas.
 */
export function mockApi(handlers: Record<string, Handler>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const key = `${(init.method ?? 'GET').toUpperCase()} ${String(input)}`
    const handler = handlers[key]
    if (!handler) throw new Error(`Petición no prevista en la prueba: ${key}`)
    return handler(init)
  })
}
