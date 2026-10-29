import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Budget } from '@/features/reports/api'
import { BudgetsPage } from '@/features/reports/BudgetsPage'
import { BudgetBar } from '@/features/reports/charts'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { SmallMultiples } from '@/features/reports/SmallMultiples'
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
  it('muestra el total del mes, la comparación en una frase y en qué se gastó', async () => {
    api({
      '/api/reports/summary': {
        month: '2026-10-01', total: '120000.00', count: 3, previous_total: '100000.00',
        by_category: [{ id: 'c-super', name: 'Supermercado', total: '120000.00', count: 3 }],
      },
    })

    renderWithProviders(<SpendingPage />, { me: MEMBER_ME, route: '/gastos?mes=2026-10' })

    expect(await screen.findByText(/En octubre de 2026 gastamos/i)).toBeInTheDocument()
    expect(screen.getAllByText(/120\.000,00/).length).toBeGreaterThan(0)
    expect(screen.getByText(/20\.000,00 más que el mes anterior/)).toBeInTheDocument()
    expect(screen.getByText('Supermercado')).toBeInTheDocument()
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

describe('Informes', () => {
  it('compara los meses que se elijan y se pueden agregar o quitar', async () => {
    const byMonth: Record<string, string> = { '2026-08': '100.00', '2026-09': '200.00', '2026-10': '400.00', '2026-11': '50.00' }
    const empty = new Set(['2026-12'])
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const from = new URL(String(input), 'http://x').searchParams.get('date_from')!.slice(0, 7)
      return jsonResponse(empty.has(from) ? [] : [{ id: 'c-super', name: 'Supermercado', total: byMonth[from], count: 1 }])
    })
    renderWithProviders(<ReportsPage />, {
      me: ADMIN_ME,
      route: '/informes?vista=comparar&meses=2026-08,2026-09,2026-10,2026-12',
    })

    const table = await screen.findByRole('table')
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Categoría', 'ago 2026', 'sept 2026', 'oct 2026', 'dic 2026sin pagos', 'Promedio', 'Variación'])
    const total = within(table).getByRole('row', { name: /^Total/ })
    // Diciembre no tiene pagos: no cuenta para el promedio ni para la variación.
    expect(total).toHaveTextContent('233,33') // promedio de 100, 200 y 400
    expect(total).toHaveTextContent('300,00') // variación: 400 − 100

    await userEvent.type(screen.getByLabelText('Mes a agregar'), '2026-11')
    await userEvent.click(screen.getByRole('button', { name: /Agregar/ }))
    expect(await within(screen.getByRole('table')).findByText('nov 2026')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar ago 2026' }))
    await vi.waitFor(() =>
      expect(within(screen.getByRole('table')).queryByText('ago 2026')).not.toBeInTheDocument(),
    )
  })

  it('las vistas separan resumen, evolución y comparación', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse([]))
    renderWithProviders(<ReportsPage />, { me: ADMIN_ME, route: '/informes' })

    expect(screen.getByRole('tab', { name: /Resumen/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('Evolución mensual')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /Evolución/ }))
    expect(await screen.findByText('Evolución mensual')).toBeInTheDocument()
    expect(screen.queryByText('Por categoría')).not.toBeInTheDocument()
  })
})

describe('Vistas nuevas de informes', () => {
  it('Este mes: proyección y gasto acumulado contra el mes anterior', async () => {
    api({
      '/api/reports/daily?month=2026-09': [{ date: '2026-09-02', total: '1000.00', count: 1 }],
      '/api/reports/daily?month=2026-10': [
        { date: '2026-10-01', total: '500.00', count: 1 },
        { date: '2026-10-03', total: '250.00', count: 1 },
      ],
      '/api/reports/projection': {
        month: '2026-10-01', spent: '750.00', pending: '1000.00', pending_count: 1,
        unknown_count: 1, projected: '1750.00',
      },
    })
    renderWithProviders(<ReportsPage />, { me: ADMIN_ME, route: '/informes?vista=mes&mes=2026-10' })

    expect(await screen.findByText(/1\.750,00/)).toBeInTheDocument()
    expect(screen.getByText(/1 vencimiento \+ 1 de importe a definir/)).toBeInTheDocument()
    // Al final del mes: 750 acumulado contra 1.000 del mes anterior.
    const chart = await screen.findByRole('img')
    expect(chart).toHaveAccessibleName(/octubre de 2026: \$\s?750,00/)
    expect(chart).toHaveAccessibleName(/septiembre de 2026: \$\s?1\.000,00/)
  })

  it('Vencimientos: a tiempo, tarde y vencidos con texto, no solo color', async () => {
    api({
      '/api/reports/punctuality': {
        months: [{ month: '2026-10-01', on_time: 2, late: 1, overdue: 1 }],
        services: [{ id: 's1', name: 'Gas', on_time: 0, late: 1, overdue: 1 }],
      },
    })
    renderWithProviders(<ReportsPage />, { me: ADMIN_ME, route: '/informes?vista=vencimientos' })

    expect(await screen.findByText(/A tiempo \$?2 vencimientos|A tiempo 2 vencimientos/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gas' })).toHaveAttribute('href', '/calendario/servicios/s1')
    expect(screen.getAllByText('Vencido sin pagar').length).toBeGreaterThan(0)
  })
})

describe('Desglose por grupo', () => {
  it('un mini gráfico por grupo, con la variación del último mes', async () => {
    renderWithProviders(
      <SmallMultiples
        months={[
          { long: 'septiembre de 2026', short: 'sept' },
          { long: 'octubre de 2026', short: 'oct' },
        ]}
        panels={[
          { key: 'auto', name: 'Auto', values: [600, 400] },
          { key: 'super', name: 'Supermercado', values: [100, 300] },
        ]}
      />,
    )

    const [auto, supermarket] = screen.getAllByRole('listitem').filter((li) => li.querySelector('ol'))
    expect(within(auto).getByText(/Total \$\s?1\.000,00/)).toBeInTheDocument()
    expect(within(auto).getByText(/menos que el mes anterior/)).toBeInTheDocument()
    expect(within(supermarket).getByText(/más que el mes anterior/)).toBeInTheDocument()
    await userEvent.hover(within(supermarket).getByRole('button', { name: /septiembre de 2026/ }))
    expect(within(supermarket).getByText(/\$\s?100,00/)).toBeInTheDocument()
  })
})
