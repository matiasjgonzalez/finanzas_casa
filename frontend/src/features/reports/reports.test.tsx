import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Budget } from '@/features/reports/api'
import { BudgetsPage } from '@/features/reports/BudgetsPage'
import { BudgetBar } from '@/features/reports/charts'
import { type ColumnRow, StackedColumns } from '@/features/reports/StackedColumns'
import { SpendingPage } from '@/features/reports/SpendingPage'
import { ToPayPage } from '@/features/services/ToPayPage'
import { HomePage } from '@/pages/HomePage'
import { ADMIN_ME, jsonResponse, MEMBER_ME, renderWithProviders } from '@/test/utils'

const CATEGORIES = [
  { id: 'c-super', name: 'Supermercado', structure: 'simple', item_label: null, is_active: true, types: [], items: [] },
  { id: 'c-otros', name: 'Otros', structure: 'simple', item_label: null, is_active: true, types: [], items: [] },
]

const SUPER_BUDGET: Budget = {
  category: { id: 'c-super', name: 'Supermercado' },
  amount: '500000.00',
  spent: '550000.00',
  since: '2026-09-01',
  status: 'exceeded',
}

/** Responde según el comienzo de la ruta; registra los PUT. */
function api(routes: Record<string, unknown>, puts: unknown[] = []) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = String(input)
    if (init.method === 'PUT') {
      puts.push({ url, body: JSON.parse(String(init.body)) })
      return new Response(null, { status: 204 })
    }
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix))
    if (!key) throw new Error(`Petición no prevista: ${url}`)
    return jsonResponse(routes[key])
  })
}

describe('Gráficos', () => {
  it('el estado del presupuesto se lee con texto, no solo con color', () => {
    renderWithProviders(<BudgetBar spent="550000" amount="500000" status="exceeded" />)

    expect(screen.getByText(/Superado · 110 %/)).toBeInTheDocument()
    expect(screen.getByText(/Pasado por \$\s?50\.000,00/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '110')
  })

  it('las columnas apiladas muestran el detalle al pasar el mouse y se pueden ver como tabla', async () => {
    const series = [
      { key: 'super', label: 'Supermercado', color: 'var(--series-1)' },
      { key: 'auto', label: 'Auto', color: 'var(--series-2)' },
    ]
    const rows: ColumnRow[] = [
      { key: '2026-09', label: 'septiembre de 2026', short: 'sept', values: { super: 1000 } },
      { key: '2026-10', label: 'octubre de 2026', short: 'oct', values: { super: 3500.5, auto: 35000 } },
    ]
    renderWithProviders(<StackedColumns rows={rows} series={series} />)

    // Por defecto, el último mes con su desglose.
    expect(screen.getByText(/38\.500,50/)).toBeInTheDocument()
    expect(screen.getByText(/Auto \$\s?35\.000,00/)).toBeInTheDocument()
    await userEvent.hover(screen.getByRole('button', { name: /septiembre de 2026/ }))
    expect(screen.getByText(/Supermercado \$\s?1\.000,00/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ver como tabla' }))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      '',
      'Supermercado',
      'Auto',
      'Total',
    ])
  })
})

describe('Inicio (simple)', () => {
  it('ofrece las tres acciones principales con sus datos', async () => {
    api({
      '/api/reports/summary': {
        month: '2026-10-01', total: '120000.00', count: 3, previous_total: '100000.00',
        by_category: [{ id: 'c-super', name: 'Supermercado', total: '120000.00', count: 3 }],
      },
      '/api/service-periods/alerts': { overdue: 1, due_soon: 1, days: 7, items: [] },
      '/api/transactions': { items: [], total: 0, page: 1, page_size: 4, total_amount: '0' },
    })

    renderWithProviders(<HomePage />, { me: ADMIN_ME })

    expect(screen.getByRole('heading', { name: '¿Qué querés hacer?' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Cargar un pago/ })).toHaveAttribute('href', '/pagos/nuevo')
    const toPay = screen.getByRole('link', { name: /Por pagar/ })
    expect(toPay).toHaveAttribute('href', '/por-pagar')
    expect(await within(toPay).findByText(/2 cuentas esta semana/)).toBeInTheDocument()
    expect(within(toPay).getByText(/1 vencida/)).toBeInTheDocument()
    expect(await screen.findByText(/120\.000,00 este mes/)).toBeInTheDocument()
  })
})

describe('Por pagar', () => {
  it('muestra primero las vencidas, con frases claras y un botón Pagar', async () => {
    const today = new Date()
    const iso = (days: number) => {
      const d = new Date(today)
      d.setDate(d.getDate() + days)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    api({
      '/api/service-periods': [
        {
      id: 'p-luz', service: { id: 's-p-luz', name: 'Luz', provider: null, amount_type: 'fixed', frequency: 'monthly', is_active: true },
      category: { id: 'c', name: 'Servicio' }, category_type: { id: 't', name: 'Luz' }, item: null,
      due_date: '' + iso(3) + '', amount_due: '45000.00', currency: 'ARS', status: 'pending', paid_on: null, amount_paid: null,
      transaction_id: null, notes: null,
    },
        {
      id: 'p-gas', service: { id: 's-p-gas', name: 'Gas', provider: null, amount_type: 'fixed', frequency: 'monthly', is_active: true },
      category: { id: 'c', name: 'Servicio' }, category_type: { id: 't', name: 'Gas' }, item: null,
      due_date: '' + iso(-5) + '', amount_due: '30000.00', currency: 'ARS', status: 'pending', paid_on: null, amount_paid: null,
      transaction_id: null, notes: null,
    },
        { ...{
      id: 'p-agua', service: { id: 's-p-agua', name: 'Agua', provider: null, amount_type: 'fixed', frequency: 'monthly', is_active: true },
      category: { id: 'c', name: 'Servicio' }, category_type: { id: 't', name: 'Agua' }, item: null,
      due_date: '' + iso(-2) + '', amount_due: '28000.00', currency: 'ARS', status: 'pending', paid_on: null, amount_paid: null,
      transaction_id: null, notes: null,
    }, status: 'paid' },
      ],
    })

    renderWithProviders(<ToPayPage />, { me: MEMBER_ME })

    const overdue = await screen.findByRole('heading', { name: /Vencidas \(1\)/ })
    const overdueList = overdue.parentElement!
    expect(within(overdueList).getByText('Gas')).toBeInTheDocument()
    expect(within(overdueList).getByText('Venció hace 5 días')).toBeInTheDocument()
    expect(within(overdueList).getByRole('link', { name: 'Pagar' })).toHaveAttribute('href', '/calendario/vencimientos/p-gas')
    expect(screen.getByRole('heading', { name: /Vencen esta semana \(1\)/ })).toBeInTheDocument()
    expect(screen.queryByText('Agua')).not.toBeInTheDocument() // ya pagada
  })

  it('sin cuentas pendientes dice que está todo al día', async () => {
    api({ '/api/service-periods': [] })

    renderWithProviders(<ToPayPage />, { me: MEMBER_ME })

    expect(await screen.findByText('¡Todo al día!')).toBeInTheDocument()
  })
})

describe('Cuánto gastamos', () => {
  const months = (year: number, totals: Record<number, string> = {}) =>
    Array.from({ length: 12 }, (_, i) => ({
      month: `${year}-${String(i + 1).padStart(2, '0')}-01`,
      total: totals[i + 1] ?? '0',
      count: totals[i + 1] ? 1 : 0,
    }))
  const node = (id: string | null, name: string, total: string, children: unknown[] = []) => ({
    id, name, total, count: 1, children,
  })
  const OCTOBER = {
    period: 'month', start: '2026-10-01', end: '2026-10-31', total: '120000.00', count: 6,
    previous_total: '100000.00',
    months: months(2026, { 9: '100000.00', 10: '120000.00' }).slice(0, 12),
    categories: [
      node('c-auto', 'Auto', '80000.00', [
        node('i-camioneta', 'Camioneta', '80000.00', [
          node('t-nafta', 'Nafta', '60000.00'),
          node('t-lavado', 'Lavado', '20000.00'),
        ]),
      ]),
      node('c-servicio', 'Servicio', '30000.00', [node('t-gas', 'Gas', '30000.00')]),
      node('c-super', 'Supermercado', '10000.00'),
    ],
  }

  it('muestra el total del mes, la comparación y el detalle de cada categoría', async () => {
    api({ '/api/reports/spending': OCTOBER })

    renderWithProviders(<SpendingPage />, { me: MEMBER_ME, route: '/gastos?mes=2026-10' })

    expect(await screen.findByText(/En octubre de 2026 gastamos/i)).toBeInTheDocument()
    expect(screen.getByText(/20\.000,00 más que el mes anterior/)).toBeInTheDocument()
    // Auto → Camioneta → Nafta y Lavado, con su monto y su parte de la camioneta.
    const camioneta = screen.getByRole('list', { name: 'Detalle de Camioneta' })
    expect(within(camioneta).getByText('Nafta')).toBeInTheDocument()
    expect(within(camioneta).getByText(/60\.000,00/)).toBeInTheDocument()
    expect(within(camioneta).getByText('75 %')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Detalle de Servicio' })).getByText('Gas')).toBeInTheDocument()

    // Se puede ocultar el detalle de una categoría.
    await userEvent.click(screen.getByRole('button', { name: /^Auto/, expanded: true }))
    expect(screen.queryByRole('list', { name: 'Detalle de Camioneta' })).not.toBeInTheDocument()
  })

  it('por año: total del año, comparación, promedio y los 12 meses', async () => {
    const fetch = api({
      '/api/reports/spending': {
        ...OCTOBER, period: 'year', start: '2025-01-01', end: '2025-12-31', total: '1200000.00',
        previous_total: '0', months: months(2025, { 3: '1200000.00' }),
      },
    })

    renderWithProviders(<SpendingPage />, { me: MEMBER_ME, route: '/gastos?periodo=anio&anio=2025' })

    expect(await screen.findByText(/En 2025 gastamos/i)).toBeInTheDocument()
    expect(screen.getByText(/Promedio por mes: \$\s?100\.000,00/)).toBeInTheDocument()
    expect(screen.getByText('Mes a mes en 2025')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /marzo de 2025: \$\s?1\.200\.000,00/ })).toBeInTheDocument()
    expect(String(fetch.mock.calls[0][0])).toContain('year=2025')
    expect(screen.getByRole('button', { name: 'Por año' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('el gráfico mes a mes se puede ver de una sola categoría', async () => {
    const fetch = api({
      '/api/reports/spending': OCTOBER,
      '/api/reports/monthly': months(2026, { 10: '80000.00' }),
    })
    renderWithProviders(<SpendingPage />, { me: MEMBER_ME, route: '/gastos?mes=2026-10' })

    await userEvent.click(await screen.findByRole('button', { name: 'Auto', pressed: false }))

    expect(await screen.findByText('Solo Auto.')).toBeInTheDocument()
    // Solo se pide al elegir la categoría (antes, con "Todo", alcanza con el total).
    const monthly = fetch.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith('/api/reports/monthly'))
    expect(monthly).toEqual([expect.stringContaining('category_id=c-auto')])
  })
})

describe('Presupuestos', () => {
  const routes = {
    '/api/budgets': [SUPER_BUDGET],
    '/api/categories': CATEGORIES,
    '/api/reports/breakdown': [{ id: 'c-otros', name: 'Otros', total: '20000.00', count: 2 }],
  }

  it('el administrador fija un límite que rige desde el mes elegido', async () => {
    const puts: unknown[] = []
    api(routes, puts)
    renderWithProviders(<BudgetsPage />, { me: ADMIN_ME, route: '/presupuestos?mes=2026-10' })

    const otros = (await screen.findByText('Otros')).closest('li')!
    expect(within(otros).getByText(/sin presupuesto/)).toBeInTheDocument()
    await userEvent.click(within(otros).getByRole('button', { name: 'Fijar presupuesto de Otros' }))
    await userEvent.type(screen.getByLabelText('Límite mensual para Otros'), '80000')
    expect(screen.getByLabelText('Límite mensual para Otros')).toHaveValue('80.000')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await vi.waitFor(() =>
      expect(puts).toEqual([{ url: '/api/budgets/c-otros', body: { month: '2026-10', amount: '80000.00' } }]),
    )
  })

  it('un integrante lo ve pero no lo puede cambiar', async () => {
    api(routes)
    renderWithProviders(<BudgetsPage />, { me: MEMBER_ME, route: '/presupuestos?mes=2026-10' })

    expect(await screen.findByText(/Límite vigente desde septiembre de 2026/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /presupuesto de/ })).not.toBeInTheDocument()
  })
})
