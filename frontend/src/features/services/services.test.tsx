import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '@/features/catalog/api'
import type { Period, PeriodDetail } from '@/features/services/api'
import { CalendarPage } from '@/features/services/CalendarPage'
import { PeriodPage } from '@/features/services/PeriodPage'
import { DueDateEditor } from '@/features/services/DueDateEditor'
import { PaymentsCalendarPage } from '@/features/services/PaymentsCalendarPage'
import { ADMIN_ME, jsonResponse, MEMBER_ME, mockApi, renderWithProviders } from '@/test/utils'

const PERIOD: Period = {
  id: 'p1',
  service: { id: 's1', name: 'Luz', provider: 'Edesur', amount_type: 'fixed', frequency: 'monthly', is_active: true },
  category: { id: 'c-serv', name: 'Servicio' },
  category_type: { id: 't-luz', name: 'Luz' },
  item: null,
  due_date: '2026-10-10',
  amount_due: '45000.00',
  currency: 'ARS',
  status: 'overdue',
  paid_on: null,
  amount_paid: null,
  transaction_id: null,
  paid_by: null,
  notes: null,
  attachments_count: 0,
  updated_at: '2026-10-01T00:00:00Z',
}
const DETAIL: PeriodDetail = { ...PERIOD, attachments: [] }

describe('Calendario', () => {
  it('muestra los vencimientos del mes con su estado y el aviso de vencidos', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith('/api/service-periods?')) {
        return jsonResponse([PERIOD, { ...PERIOD, id: 'p2', due_date: '2026-10-20', status: 'pending', service: { ...PERIOD.service, name: 'Gas' } }])
      }
      if (url.startsWith('/api/service-periods/alerts')) {
        return jsonResponse({ overdue: 1, due_soon: 0, days: 7, items: [PERIOD] })
      }
      throw new Error(`Petición no prevista: ${url}`)
    })
    renderWithProviders(<CalendarPage />, { route: '/calendario?mes=2026-10', me: ADMIN_ME })

    const grid = await screen.findByRole('grid', { name: 'octubre de 2026' })
    const day10 = within(grid).getByRole('gridcell', { name: '10/10/2026' })
    expect(within(day10).getByRole('link', { name: /Luz/ })).toHaveAttribute('href', '/calendario/vencimientos/p1')
    expect(within(day10).getByLabelText('Vencido')).toBeInTheDocument()
    expect(within(grid).getByRole('gridcell', { name: '20/10/2026' })).toHaveTextContent('Gas')
    expect(await screen.findByText('Tenés 1 vencimiento vencido.')).toBeInTheDocument()
  })
})

function renderPeriod(extra: Parameters<typeof mockApi>[0], me = MEMBER_ME) {
  const fetchMock = mockApi({ 'GET /api/service-periods/p1': () => jsonResponse(DETAIL), ...extra })
  renderWithProviders(
    <Routes>
      <Route path="/calendario/vencimientos/:periodId" element={<PeriodPage />} />
    </Routes>,
    { route: '/calendario/vencimientos/p1', me },
  )
  return fetchMock
}

describe('Vencimiento', () => {
  it('registra el pago con la fecha y el importe (formato argentino)', async () => {
    const fetchMock = renderPeriod({
      'POST /api/service-periods/p1/pay': () =>
        jsonResponse({ ...DETAIL, status: 'paid', paid_on: '2026-10-12', amount_paid: '46500.50', transaction_id: 't9', paid_by: { id: 'u-member', full_name: 'Leo' } }),
    })

    const amount = await screen.findByLabelText('Importe')
    expect(amount).toHaveValue('45.000,00') // sugerido: el importe del vencimiento
    await userEvent.clear(amount)
    await userEvent.type(amount, '46.500,50')
    await userEvent.clear(screen.getByLabelText('Fecha de pago'))
    await userEvent.type(screen.getByLabelText('Fecha de pago'), '2026-10-12')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))

    const call = fetchMock.mock.calls.find(([url]) => url === '/api/service-periods/p1/pay')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      mode: 'create',
      paid_on: '2026-10-12',
      amount: '46500.50',
    })
  })

  it('vincula un pago ya registrado en lugar de crear otro', async () => {
    const fetchMock = renderPeriod({
      'GET /api/service-periods/p1/candidates': () =>
        jsonResponse([
          {
            id: 't-existente', amount: '44100.00', currency: 'ARS', occurred_on: '2026-10-09',
            category: { id: 'c-serv', name: 'Servicio' }, category_type: { id: 't-luz', name: 'Luz' }, item: null,
            description: null, notes: null, created_by: { id: 'u1', full_name: 'Ana' }, attachments_count: 0,
            service_period_id: null, can_edit: true, created_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z',
          },
        ]),
      'POST /api/service-periods/p1/pay': () => jsonResponse({ ...DETAIL, status: 'paid' }),
    })

    await userEvent.click(await screen.findByRole('button', { name: /Vincular ese pago/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Vincular' }))

    const call = fetchMock.mock.calls.find(([url]) => url === '/api/service-periods/p1/pay')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ mode: 'link', transaction_id: 't-existente' })
  })

  it('un vencimiento pagado muestra el pago y permite anularlo a quien lo registró', async () => {
    mockApi({
      'GET /api/service-periods/p1': () =>
        jsonResponse({ ...DETAIL, status: 'paid', paid_on: '2026-10-12', amount_paid: '45000.00', transaction_id: 't9', paid_by: { id: 'u-member', full_name: 'Leo Pérez' } }),
    })
    renderWithProviders(
      <Routes>
        <Route path="/calendario/vencimientos/:periodId" element={<PeriodPage />} />
      </Routes>,
      { route: '/calendario/vencimientos/p1', me: MEMBER_ME },
    )

    expect(await screen.findByText('El 12/10/2026 por Leo Pérez.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver en Pagos/ })).toHaveAttribute('href', '/pagos/t9')
    expect(screen.getByRole('button', { name: 'Anular pago' })).toBeInTheDocument()
  })
})

const CARD: Category = {
  id: 'c-card', name: 'Tarjeta de crédito', structure: 'types', item_label: null, is_active: true,
  types: [{ id: 't-visa', name: 'Visa', is_active: true }], items: [],
}

describe('Vencimiento de un tipo', () => {
  it('un tipo con vencimiento se programa con fecha, frecuencia e importe', async () => {
    let sent: unknown
    mockApi({
      'POST /api/services': (init) => {
        sent = JSON.parse(String(init.body))
        return jsonResponse({ id: 's-visa' }, 201)
      },
      'GET /api/services?include_inactive=false': () => jsonResponse([]),
    })
    renderWithProviders(<DueDateEditor category={CARD} type={CARD.types[0]} />, { me: ADMIN_ME })

    expect(screen.queryByLabelText('Fecha de vencimiento')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Tiene vencimiento' }))
    await userEvent.clear(screen.getByLabelText('Fecha de vencimiento'))
    await userEvent.type(screen.getByLabelText('Fecha de vencimiento'), '2026-11-05')
    await userEvent.type(screen.getByLabelText('Importe de cada vencimiento'), '250000')
    expect(screen.getByLabelText('Importe de cada vencimiento')).toHaveValue('250.000')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await vi.waitFor(() => expect(sent).toBeDefined())
    expect(sent).toEqual({
      name: 'Visa', provider: null, description: null, notes: null,
      category_id: 'c-card', category_type_id: 't-visa', item_id: null,
      frequency: 'monthly', first_due_date: '2026-11-05', amount_type: 'fixed',
      estimated_amount: '250000.00', is_active: true,
    })
  })

  it('con importe fijo, el importe es obligatorio', async () => {
    const fetchSpy = mockApi({})
    renderWithProviders(<DueDateEditor category={CARD} type={CARD.types[0]} />, { me: ADMIN_ME })

    await userEvent.click(screen.getByRole('switch', { name: 'Tiene vencimiento' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Con importe fijo, indicá el importe.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('Calendario de pagos realizados', () => {
  it('muestra los pagos cargados del mes con su total', async () => {
    const payment = (id: string, amount: string, description: string) => ({
      id, amount, currency: 'ARS', occurred_on: '2026-10-05', description, notes: null,
      category: { id: 'c-card', name: 'Tarjeta de crédito' }, category_type: null, item: null,
      created_by: { id: 'u-admin', full_name: 'Ana Pérez' }, attachments_count: 0, can_edit: true,
      created_at: '2026-10-05T12:00:00Z', updated_at: '2026-10-05T12:00:00Z',
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      expect(String(input)).toContain('page_size=500')
      return jsonResponse({
        items: [payment('t1', '10000.00', 'Supermercado'), payment('t2', '2500.50', 'Farmacia')],
        total: 2, page: 1, page_size: 500, total_amount: '12500.50',
      })
    })

    renderWithProviders(<PaymentsCalendarPage />, { me: ADMIN_ME, route: '/calendario/pagos?mes=2026-10' })

    expect((await screen.findAllByText('Supermercado')).length).toBeGreaterThan(0)
    expect(screen.getByText(/2 pagos/)).toBeInTheDocument()
    expect(screen.getAllByText(/12\.500,50/).length).toBeGreaterThan(0)
  })
})
