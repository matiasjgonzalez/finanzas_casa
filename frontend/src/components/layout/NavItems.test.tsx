import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NavItems } from '@/components/layout/NavItems'
import { renderWithProviders } from '@/test/utils'

const MEMBER_SECTIONS = ['Inicio', 'Pagos', 'Calendario', 'Presupuestos', 'Informes']

describe('NavItems', () => {
  it('muestra las secciones del usuario familiar y oculta Administración', () => {
    renderWithProviders(<NavItems role="member" />)

    for (const name of MEMBER_SECTIONS) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument()
  })

  it('muestra Administración al administrador', () => {
    renderWithProviders(<NavItems role="admin" />)

    expect(screen.getByRole('link', { name: 'Administración' })).toHaveAttribute(
      'href',
      '/administracion',
    )
  })

  it('al superadmin solo le muestra Hogares', () => {
    renderWithProviders(<NavItems role="superadmin" />)

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Hogares'])
  })

  it('marca la sección actual para lectores de pantalla', () => {
    renderWithProviders(<NavItems role="member" />, { route: '/pagos' })

    expect(screen.getByRole('link', { name: 'Pagos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current')
  })
})
