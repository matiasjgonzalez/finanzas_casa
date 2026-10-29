import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { NewUserPage } from '@/features/users/NewUserPage'
import { ADMIN_ME, jsonResponse, mockApi, renderWithProviders } from '@/test/utils'

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/administracion/usuarios/nuevo" element={<NewUserPage />} />
      <Route path="/administracion" element={<p>Listado de usuarios</p>} />
    </Routes>,
    { route: '/administracion/usuarios/nuevo', me: ADMIN_ME },
  )
}

async function fillForm(password = 'una-contraseña-larga') {
  await userEvent.type(screen.getByLabelText('Nombre'), 'Leo Pérez')
  await userEvent.type(screen.getByLabelText('Usuario'), 'leo')
  await userEvent.type(screen.getByLabelText('Contraseña inicial'), password)
}

describe('NewUserPage', () => {
  it('exige una contraseña de al menos 6 caracteres', async () => {
    const fetchMock = mockApi({})
    renderPage()

    await fillForm('corta')
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('Usá al menos 6 caracteres.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('crea el usuario con el rol elegido y vuelve al listado', async () => {
    const fetchMock = mockApi({
      'POST /api/users': (init) => jsonResponse({ ...JSON.parse(String(init.body)), id: 'u-2' }, 201),
      'GET /api/users': () => jsonResponse([]),
    })
    renderPage()

    await fillForm()
    await userEvent.click(screen.getByRole('radio', { name: /Administrador/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('Listado de usuarios')).toBeInTheDocument()
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toEqual({
      full_name: 'Leo Pérez',
      username: 'leo',
      password: 'una-contraseña-larga',
      role: 'admin',
    })
  })

  it('rechaza nombres de usuario con espacios', async () => {
    const fetchMock = mockApi({})
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'Leo Pérez')
    await userEvent.type(screen.getByLabelText('Usuario'), 'leo perez')
    await userEvent.type(screen.getByLabelText('Contraseña inicial'), 'una-contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText(/sin espacios\)\.$/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('envía el usuario en minúsculas', async () => {
    const fetchMock = mockApi({
      'POST /api/users': (init) => jsonResponse({ ...JSON.parse(String(init.body)), id: 'u-2' }, 201),
      'GET /api/users': () => jsonResponse([]),
    })
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'Leo Pérez')
    await userEvent.type(screen.getByLabelText('Usuario'), ' Leo.Perez ')
    await userEvent.type(screen.getByLabelText('Contraseña inicial'), 'una-contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    await screen.findByText('Listado de usuarios')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).username).toBe('leo.perez')
  })

  it('muestra junto al campo que el usuario ya existe', async () => {
    mockApi({
      'POST /api/users': () => jsonResponse({ detail: 'Ese nombre de usuario ya está en uso.' }, 409),
    })
    renderPage()

    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('Ese nombre de usuario ya está en uso.')).toBeInTheDocument()
    expect(screen.getByLabelText('Usuario')).toHaveAttribute('aria-invalid', 'true')
  })
})
