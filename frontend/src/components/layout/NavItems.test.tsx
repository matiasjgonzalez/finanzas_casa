import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NavItems } from '@/components/layout/NavItems'
import { renderWithProviders } from '@/test/utils'

// Lo de todos los días, con palabras simples, y el resto en "Más opciones".
const MEMBER_SECTIONS = ['Inicio', 'Cargar un pago', 'Por pagar', 'Pagos hechos', 'Cuánto gastamos']
const MORE_SECTIONS = ['Calendario', 'Presupuestos', 'Mi cuenta', 'Ayuda']

describe('NavItems', () => {
  it('muestra las secciones del usuario familiar y oculta Administración', () => {
    renderWithProviders(<NavItems role="member" />)

    const [main, more] = screen.getAllByRole('list')
    expect(within(main).getAllByRole('link').map((l) => l.textContent)).toEqual(MEMBER_SECTIONS)
    expect(within(more).getAllByRole('link').map((l) => l.textContent)).toEqual(MORE_SECTIONS)
    expect(screen.getByText('Más opciones')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument()
  })

  it('muestra Categorías en el menú principal y Administración al administrador', () => {
    renderWithProviders(<NavItems role="admin" />)

    const [main] = screen.getAllByRole('list')
    expect(within(main).getAllByRole('link').map((l) => l.textContent)).toEqual([...MEMBER_SECTIONS, 'Categorías'])
    expect(screen.getByRole('link', { name: 'Categorías' })).toHaveAttribute('href', '/categorias')
    expect(screen.getByRole('link', { name: 'Administración' })).toHaveAttribute(
      'href',
      '/administracion',
    )
  })

  it('al superadmin le muestra Hogares, Seguridad, su cuenta y la ayuda (nada de un hogar)', () => {
    renderWithProviders(<NavItems role="superadmin" />)

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Hogares',
      'Seguridad',
      'Mi cuenta',
      'Ayuda',
    ])
  })

  it('marca la sección actual para lectores de pantalla', () => {
    renderWithProviders(<NavItems role="member" />, { route: '/pagos' })

    expect(screen.getByRole('link', { name: 'Pagos hechos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Cargar un pago' })).not.toHaveAttribute('aria-current')
  })

  it('en "Cargar un pago" no marca también "Pagos hechos"', () => {
    renderWithProviders(<NavItems role="member" />, { route: '/pagos/nuevo' })

    expect(screen.getByRole('link', { name: 'Cargar un pago' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Pagos hechos' })).not.toHaveAttribute('aria-current')
  })
})
