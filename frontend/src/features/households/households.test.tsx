import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { RequireHousehold, RequireSuperadmin } from '@/features/auth/RequireAuth'
import type { User } from '@/features/auth/types'
import type { HouseholdOverview, HouseholdSummary } from '@/features/households/api'
import { HouseholdLayout } from '@/features/households/HouseholdLayout'
import { HouseholdsPage } from '@/features/households/HouseholdsPage'
import { NewHouseholdPage } from '@/features/households/NewHouseholdPage'
import { UsersPage } from '@/features/users/UsersPage'
import {
  ADMIN_ME,
  jsonResponse,
  mockApi,
  renderWithProviders,
  SUPERADMIN_ME,
} from '@/test/utils'

const HOME: HouseholdSummary = {
  id: 'h-1',
  name: 'Mi hogar',
  is_active: true,
  created_at: '2026-10-01T12:00:00Z',
  users_count: 2,
  admins_count: 0,
}

describe('Acceso según el rol', () => {
  const routes = (
    <Routes>
      <Route element={<RequireHousehold />}>
        <Route path="/pagos" element={<p>Pagos del hogar</p>} />
      </Route>
      <Route element={<RequireSuperadmin />}>
        <Route path="/hogares" element={<p>Listado de hogares</p>} />
      </Route>
      <Route path="/" element={<p>Inicio</p>} />
    </Routes>
  )

  it('el superadmin no entra a los datos de un hogar: va a Hogares', () => {
    renderWithProviders(routes, { route: '/pagos', me: SUPERADMIN_ME })

    expect(screen.getByText('Listado de hogares')).toBeInTheDocument()
    expect(screen.queryByText('Pagos del hogar')).not.toBeInTheDocument()
  })

  it('un administrador de hogar no entra a Hogares', () => {
    renderWithProviders(routes, { route: '/hogares', me: ADMIN_ME })

    expect(screen.getByText('Inicio')).toBeInTheDocument()
  })
})

describe('Hogares', () => {
  it('muestra el panel: totales y cada hogar con sus cuentas', async () => {
    const account = (over: Partial<User>): User => ({
      id: crypto.randomUUID(),
      username: 'x',
      full_name: 'X',
      role: 'member',
      is_active: true,
      must_change_password: false,
      last_login_at: null,
      created_at: '2026-10-01T12:00:00Z',
      ...over,
    })
    const overview: HouseholdOverview[] = [
      {
        ...HOME,
        users_count: 3,
        admins_count: 1,
        members: [
          account({ username: 'ana', role: 'admin', last_login_at: '2026-11-04T15:30:00Z' }),
          account({ username: 'leo', must_change_password: true }),
          account({ username: 'eva', is_active: false }),
        ],
      },
      { ...HOME, id: 'h-2', name: 'Casa de Jose', users_count: 0, admins_count: 0, members: [] },
    ]
    mockApi({ 'GET /api/households/overview': () => jsonResponse(overview) })

    renderWithProviders(<HouseholdsPage />, { me: SUPERADMIN_ME })

    const accounts = await screen.findByRole('list', { name: 'Cuentas de Mi hogar' })
    expect(within(accounts).getAllByRole('listitem')).toHaveLength(3)
    expect(within(accounts).getByText('Usuario: ana')).toBeInTheDocument()
    expect(within(accounts).getByText(/Último ingreso:/)).toBeInTheDocument()
    expect(within(accounts).getByText('Contraseña provisoria')).toBeInTheDocument()
    expect(within(accounts).getByText('Nunca entró')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gestionar Mi hogar' })).toHaveAttribute(
      'href',
      '/hogares/h-1',
    )

    const totals = screen.getByText('Cuentas').parentElement!
    expect(within(totals).getByText('3')).toBeInTheDocument()
    expect(within(totals).getByText('2 activas')).toBeInTheDocument()

    expect(screen.getByText(/Casa de Jose no tiene un administrador activo/)).toBeInTheDocument()
    expect(screen.getByText(/1 cuenta todavía tiene la contraseña provisoria/)).toBeInTheDocument()
  })

  it('crea un hogar con su administrador', async () => {
    let sent: unknown
    mockApi({
      'POST /api/households': (init) => {
        sent = JSON.parse(String(init.body))
        return jsonResponse({ ...HOME, id: 'h-2', name: 'Familia de Jose' }, 201)
      },
    })
    renderWithProviders(
      <Routes>
        <Route path="/hogares/nuevo" element={<NewHouseholdPage />} />
        <Route path="/hogares/:id" element={<p>Detalle del hogar</p>} />
      </Routes>,
      { route: '/hogares/nuevo', me: SUPERADMIN_ME },
    )

    await userEvent.type(screen.getByLabelText('Nombre del hogar'), 'Familia de Jose')
    await userEvent.type(screen.getByLabelText('Nombre'), 'Jose González')
    await userEvent.type(screen.getByLabelText('Usuario'), 'Jose')
    await userEvent.type(screen.getByLabelText('Contraseña inicial'), 'provisoria')
    await userEvent.click(screen.getByRole('button', { name: 'Crear hogar' }))

    expect(await screen.findByText('Detalle del hogar')).toBeInTheDocument()
    expect(sent).toEqual({
      name: 'Familia de Jose',
      admin_full_name: 'Jose González',
      admin_username: 'jose',
      admin_password: 'provisoria',
    })
  })

  it('un nombre repetido se marca en el campo', async () => {
    mockApi({
      'POST /api/households': () =>
        jsonResponse({ detail: 'Ya existe un hogar llamado «Mi hogar».' }, 409),
    })
    renderWithProviders(<NewHouseholdPage />, { me: SUPERADMIN_ME })

    await userEvent.type(screen.getByLabelText('Nombre del hogar'), 'Mi hogar')
    await userEvent.type(screen.getByLabelText('Nombre'), 'Jose')
    await userEvent.type(screen.getByLabelText('Usuario'), 'jose')
    await userEvent.type(screen.getByLabelText('Contraseña inicial'), 'provisoria')
    await userEvent.click(screen.getByRole('button', { name: 'Crear hogar' }))

    expect(await screen.findByText('Ya existe un hogar llamado «Mi hogar».')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del hogar')).toHaveAttribute('aria-invalid', 'true')
  })

  it('el detalle muestra los usuarios de ese hogar (no los del superadmin)', async () => {
    mockApi({
      'GET /api/households/h-1': () => jsonResponse(HOME),
      'GET /api/households/h-1/users': () =>
        jsonResponse([
          { ...ADMIN_ME.user, id: 'u-jose', full_name: 'Jose', username: 'jgonzalez', role: 'member' },
        ]),
    })
    renderWithProviders(
      <Routes>
        <Route path="/hogares/:householdId" element={<HouseholdLayout />}>
          <Route index element={<UsersPage />} />
        </Route>
      </Routes>,
      { route: '/hogares/h-1', me: SUPERADMIN_ME },
    )

    expect(await screen.findByRole('heading', { name: 'Mi hogar' })).toBeInTheDocument()
    expect(screen.getByText(/no tiene administrador/)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Editar a Jose' })).toHaveAttribute(
      'href',
      '/hogares/h-1/usuarios/u-jose',
    )
    expect(screen.getByRole('link', { name: /Nuevo usuario/ })).toHaveAttribute(
      'href',
      '/hogares/h-1/usuarios/nuevo',
    )
  })
})
