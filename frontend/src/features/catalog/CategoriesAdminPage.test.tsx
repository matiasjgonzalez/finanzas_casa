import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Category } from '@/features/catalog/api'
import { CategoriesAdminPage } from '@/features/catalog/CategoriesAdminPage'
import { ADMIN_ME, jsonResponse, mockApi, renderWithProviders } from '@/test/utils'

const entry = (id: string, name: string, is_active = true) => ({ id, name, is_active })

const CATEGORIES: Category[] = [
  {
    id: 'c-car',
    name: 'Auto',
    structure: 'items_and_types',
    item_label: 'Auto',
    is_active: true,
    items: [entry('i-citroen', 'Citroen'), entry('i-toyota', 'Toyota')],
    types: [entry('t-nafta', 'Nafta'), entry('t-patente', 'Patente'), entry('t-vieja', 'Vieja', false)],
  },
  {
    id: 'c-card',
    name: 'Tarjeta de crédito',
    structure: 'types',
    item_label: null,
    is_active: true,
    items: [],
    types: [entry('t-visa', 'Visa')],
  },
]

function renderPage(extra: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({
    'GET /api/categories?include_inactive=true': () => jsonResponse(CATEGORIES),
    ...extra,
  })
  renderWithProviders(<CategoriesAdminPage />, { me: ADMIN_ME })
  return fetchMock
}

describe('Administración de categorías', () => {
  it('muestra cada categoría cerrada, con un resumen de lo que contiene', async () => {
    renderPage()

    expect(await screen.findByText('Con elementos y tipos · 2 autos · 2 tipos')).toBeInTheDocument()
    expect(screen.getByText('Con tipos · 1 tipo')).toBeInTheDocument()
    // Cerrada: los tipos no se ven hasta desplegarla.
    expect(screen.queryByRole('button', { name: 'Nafta: opciones' })).not.toBeInTheDocument()
  })

  it('al desplegar muestra los autos y los tipos como etiquetas', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /^Auto/ }))

    expect(screen.getByRole('button', { name: 'Citroen: opciones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nafta: opciones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vieja (desactivado): opciones' })).toBeInTheDocument()
  })

  it('agrega un tipo desde la etiqueta "Agregar"', async () => {
    const fetchMock = renderPage({
      'POST /api/categories/c-card/types': () => jsonResponse(entry('t-amex', 'Amex'), 201),
    })
    await userEvent.click(await screen.findByRole('button', { name: /^Tarjeta de crédito/ }))

    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await userEvent.type(screen.getByLabelText('Nuevo tipo'), 'Amex{Enter}')

    const call = fetchMock.mock.calls.find(([url]) => url === '/api/categories/c-card/types')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ name: 'Amex' })
  })

  it('desactiva un tipo desde el menú de su etiqueta', async () => {
    const fetchMock = renderPage({
      'PATCH /api/category-types/t-visa': () => jsonResponse(entry('t-visa', 'Visa', false)),
    })
    await userEvent.click(await screen.findByRole('button', { name: /^Tarjeta de crédito/ }))

    await userEvent.click(screen.getByRole('button', { name: 'Visa: opciones' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Desactivar' }))

    const call = fetchMock.mock.calls.find(([url]) => url === '/api/category-types/t-visa')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ is_active: false })
  })

  it('marca los tipos con vencimiento y permite programarlo desde la etiqueta', async () => {
    renderPage({
      'GET /api/services?include_inactive=true': () =>
        jsonResponse([
          {
            id: 's-visa', name: 'Visa', provider: null, description: null,
            category: { id: 'c-card', name: 'Tarjeta de crédito' },
            category_type: { id: 't-visa', name: 'Visa' }, item: null,
            amount_type: 'variable', estimated_amount: null, currency: 'ARS', frequency: 'monthly',
            first_due_date: '2026-11-05', is_active: true, notes: null, next_period: null,
          },
        ]),
    })

    await userEvent.click(await screen.findByRole('button', { name: /^Tarjeta de crédito/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Visa (con vencimiento): opciones' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Vencimiento/ }))

    expect(await screen.findByRole('dialog', { name: /Vencimiento de «Visa»/ })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Tiene vencimiento' })).toBeChecked()
    expect(screen.getByLabelText('Fecha de vencimiento')).toHaveValue('2026-11-05')
  })
})
