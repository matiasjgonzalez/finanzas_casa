import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TransactionsPage } from '@/features/transactions/TransactionsPage'
import type { Transaction, TransactionPage } from '@/features/transactions/types'
import { toQuery } from '@/features/transactions/useTransactionFilters'
import { ADMIN_ME, jsonResponse, renderWithProviders } from '@/test/utils'

const BASE: Transaction = {
  id: 't1',
  amount: '85000.50',
  currency: 'ARS',
  occurred_on: '2026-10-05',
  category: { id: 'c-card', name: 'Tarjeta de crédito' },
  category_type: { id: 't-visa', name: 'Visa' },
  item: null,
  description: null,
  notes: null,
  created_by: { id: 'u1', full_name: 'Ana Pérez' },
  attachments_count: 1,
  can_edit: true,
  created_at: '2026-10-05T12:00:00Z',
  updated_at: '2026-10-05T12:00:00Z',
}

const PAGE: TransactionPage = {
  items: [
    BASE,
    {
      ...BASE,
      id: 't2',
      amount: '120000.00',
      description: 'Cuota octubre',
      category: { id: 'c-car', name: 'Auto' },
      item: { id: 'i-cronos', name: 'Fiat Cronos' },
      category_type: { id: 't-seguro', name: 'Seguro' },
      attachments_count: 0,
    },
  ],
  total: 2,
  page: 1,
  page_size: 10,
  total_amount: '205000.50',
}

function renderPage(route = '/pagos') {
  const requests: string[] = []
  // vi.spyOn se restaura solo después de cada prueba (restoreMocks en vitest.config.ts).
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    // Las consultas de pagos llevan parámetros variables: se registran para revisarlas.
    if (url.startsWith('/api/transactions')) {
      requests.push(url)
      return jsonResponse(PAGE)
    }
    if (['/api/categories', '/api/payment-methods', '/api/members'].includes(url)) {
      return jsonResponse([])
    }
    throw new Error(`Petición no prevista en la prueba: ${url}`)
  })
  renderWithProviders(<TransactionsPage />, { route, me: ADMIN_ME })
  return requests
}

describe('TransactionsPage', () => {
  it('muestra cada pago con su categoría, tipo y auto, y el total pagado', async () => {
    renderPage()

    const table = await screen.findByRole('table')
    // Sin descripción, el título es la categoría completa; con descripción, la descripción.
    expect(within(table).getByRole('link', { name: 'Tarjeta de crédito · Visa' })).toHaveAttribute(
      'href',
      '/pagos/t1',
    )
    expect(within(table).getByRole('link', { name: 'Cuota octubre' })).toBeInTheDocument()
    expect(within(table).getByText('Auto · Fiat Cronos · Seguro')).toBeInTheDocument()
    expect(within(table).getByText(/\$\s85\.000,50/)).toBeInTheDocument()
    expect(screen.getByText(/\$\s205\.000,50/)).toBeInTheDocument()
    expect(screen.getByText('en 2 pagos')).toBeInTheDocument()
  })

  it('por defecto consulta el mes actual, ordenado por fecha', async () => {
    const requests = renderPage()

    await screen.findByRole('table')

    expect(requests[0]).toMatch(/date_from=\d{4}-\d{2}-01/)
    expect(requests[0]).toContain('sort=date&order=desc&page=1&page_size=10')
  })
})

describe('toQuery', () => {
  it('convierte el período elegido en fechas y omite filtros vacíos', () => {
    expect(
      toQuery({
        period: 'custom',
        from: '2026-01-01',
        to: '2026-01-31',
        category: 'c1',
        item: 'i1',
        type: '',
        user: '',
        q: '  luz ',
        sort: 'amount',
        order: 'asc',
        page: 2,
      }),
    ).toEqual({
      date_from: '2026-01-01',
      date_to: '2026-01-31',
      category_id: 'c1',
      item_id: 'i1',
      category_type_id: undefined,
      created_by_id: undefined,
      q: 'luz',
      sort: 'amount',
      order: 'asc',
      page: 2,
      page_size: 10,
    })
  })
})
