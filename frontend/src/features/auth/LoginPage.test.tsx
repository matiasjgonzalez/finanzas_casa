import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { LoginPage } from '@/features/auth/LoginPage'
import { ADMIN_ME, jsonResponse, mockApi, renderWithProviders } from '@/test/utils'

function renderLogin() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<p>Pantalla de inicio</p>} />
    </Routes>,
    { route: '/login', me: null },
  )
}

describe('LoginPage', () => {
  it('valida los campos antes de enviar', async () => {
    const fetchMock = mockApi({})
    renderLogin()

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByText('Ingresá tu usuario.')).toBeInTheDocument()
    expect(screen.getByText('Ingresá tu contraseña.')).toBeInTheDocument()
    expect(screen.getByLabelText('Usuario')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('inicia sesión y lleva a la pantalla de inicio', async () => {
    const fetchMock = mockApi({ 'POST /api/auth/login': () => jsonResponse(ADMIN_ME) })
    renderLogin()

    await userEvent.type(screen.getByLabelText('Usuario'), 'ana')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByText('Pantalla de inicio')).toBeInTheDocument()
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toEqual({ username: 'ana', password: 'contraseña-larga' })
  })

  it('después de un intento fallido, un login correcto lleva a la página pedida', async () => {
    let attempts = 0
    mockApi({
      'POST /api/auth/login': () =>
        ++attempts === 1
          ? jsonResponse({ detail: 'Usuario o contraseña incorrectos.' }, 401)
          : jsonResponse(ADMIN_ME),
    })
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/movimientos" element={<p>Movimientos</p>} />
      </Routes>,
      { route: { pathname: '/login', state: { from: '/movimientos' } }, me: null },
    )

    await userEvent.type(screen.getByLabelText('Usuario'), 'ana')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'equivocada')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    await screen.findByRole('alert')
    await userEvent.clear(screen.getByLabelText('Contraseña'))
    await userEvent.type(screen.getByLabelText('Contraseña'), 'la-correcta-123')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByText('Movimientos')).toBeInTheDocument()
  })

  it('muestra el mensaje del servidor si las credenciales son incorrectas', async () => {
    mockApi({
      'POST /api/auth/login': () =>
        jsonResponse({ detail: 'Usuario o contraseña incorrectos.' }, 401),
    })
    renderLogin()

    await userEvent.type(screen.getByLabelText('Usuario'), 'ana')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'equivocada')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.')
    expect(screen.queryByText('Pantalla de inicio')).not.toBeInTheDocument()
  })
})
