import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { RequireAdmin, RequireAuth } from '@/features/auth/RequireAuth'
import { ADMIN_ME, jsonResponse, MEMBER_ME, mockApi, renderWithProviders } from '@/test/utils'

function renderProtected(route: string, me?: typeof ADMIN_ME | null) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<p>Pantalla de login</p>} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<p>Contenido privado</p>} />
        <Route element={<RequireAdmin />}>
          <Route path="/administracion" element={<p>Panel de administración</p>} />
        </Route>
      </Route>
    </Routes>,
    { route, me },
  )
}

describe('RequireAuth', () => {
  it('consulta la sesión y lleva al login si no hay sesión', async () => {
    mockApi({ 'GET /api/auth/me': () => jsonResponse({ detail: 'Iniciá sesión.' }, 401) })

    renderProtected('/')

    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument()
    expect(screen.queryByText('Contenido privado')).not.toBeInTheDocument()
  })

  it('muestra el contenido con sesión iniciada', async () => {
    mockApi({ 'GET /api/auth/me': () => jsonResponse(MEMBER_ME) })

    renderProtected('/')

    expect(await screen.findByText('Contenido privado')).toBeInTheDocument()
  })
})

describe('RequireAdmin', () => {
  it('bloquea la administración a un integrante', () => {
    renderProtected('/administracion', MEMBER_ME)

    expect(screen.getByText('Acceso restringido')).toBeInTheDocument()
    expect(screen.queryByText('Panel de administración')).not.toBeInTheDocument()
  })

  it('permite la administración al administrador', () => {
    renderProtected('/administracion', ADMIN_ME)

    expect(screen.getByText('Panel de administración')).toBeInTheDocument()
  })
})
