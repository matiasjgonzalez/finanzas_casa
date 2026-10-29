import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ForcePasswordChangePage } from '@/features/auth/ForcePasswordChangePage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { ADMIN_ME, mockApi, renderWithProviders } from '@/test/utils'

const PENDING_ME = { ...ADMIN_ME, user: { ...ADMIN_ME.user, must_change_password: true } }

function renderApp(route: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<RequireAuth />}>
        <Route path="/cambiar-contrasena" element={<ForcePasswordChangePage />} />
        <Route path="/" element={<p>Pantalla de inicio</p>} />
        <Route path="/movimientos" element={<p>Movimientos</p>} />
      </Route>
    </Routes>,
    { route, me: PENDING_ME },
  )
}

describe('cambio obligatorio de contraseña', () => {
  it('con contraseña provisoria, cualquier página lleva a cambiarla', () => {
    renderApp('/movimientos')

    expect(screen.getByText('Cambiá tu contraseña')).toBeInTheDocument()
    expect(screen.queryByText('Movimientos')).not.toBeInTheDocument()
  })

  it('después de cambiarla, entra a la aplicación', async () => {
    const fetchMock = mockApi({
      'POST /api/auth/change-password': () => new Response(null, { status: 204 }),
    })
    renderApp('/cambiar-contrasena')

    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'admin')
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'mi-contraseña-nueva')
    await userEvent.type(screen.getByLabelText('Repetí la nueva contraseña'), 'mi-contraseña-nueva')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }))

    expect(await screen.findByText('Pantalla de inicio')).toBeInTheDocument()
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      current_password: 'admin',
      new_password: 'mi-contraseña-nueva',
    })
  })

  it('avisa si las contraseñas nuevas no coinciden', async () => {
    const fetchMock = mockApi({})
    renderApp('/cambiar-contrasena')

    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'admin')
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'mi-contraseña-nueva')
    await userEvent.type(screen.getByLabelText('Repetí la nueva contraseña'), 'otra-distinta-123')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }))

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
