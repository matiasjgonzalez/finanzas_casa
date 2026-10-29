import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '@/features/catalog/api'
import { TransactionForm } from '@/features/transactions/TransactionForm'

const entry = (id: string, name: string, is_active = true) => ({ id, name, is_active })

const CATEGORIES: Category[] = [
  {
    id: 'c-card',
    name: 'Tarjeta de crédito',
    structure: 'types',
    item_label: null,
    is_active: true,
    types: [entry('t-visa', 'Visa'), entry('t-old', 'Diners', false)],
    items: [],
  },
  {
    id: 'c-car',
    name: 'Auto',
    structure: 'items_and_types',
    item_label: 'Auto',
    is_active: true,
    types: [entry('t-seguro', 'Seguro'), entry('t-patente', 'Patente')],
    items: [entry('i-cronos', 'Fiat Cronos'), entry('i-ka', 'Ford Ka')],
  },
  {
    id: 'c-super',
    name: 'Supermercado',
    structure: 'simple',
    item_label: null,
    is_active: true,
    types: [],
    items: [],
  },
]

function renderForm(onSubmit = vi.fn()) {
  render(
    <TransactionForm
      defaultValues={{
        amount: '',
        occurred_on: '2026-10-05',
        category_id: '',
        item_id: '',
        category_type_id: '',
        description: '',
        notes: '',
      }}
      categories={CATEGORIES}
      onSubmit={onSubmit}
      submitting={false}
      error={null}
      submitLabel="Guardar pago"
      onCancel={vi.fn()}
    />,
  )
  return onSubmit
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Guardar pago' }))
// Las opciones se eligen tocando botones grandes (un grupo de "radio" con el nombre del campo).
const group = (label: string) => screen.getByRole('radiogroup', { name: label })
const options = (label: string) => within(group(label)).getAllByRole('radio').map((o) => o.textContent)
const choose = (label: string, option: string) =>
  userEvent.click(within(group(label)).getByRole('radio', { name: option }))

describe('Formulario de pago', () => {
  it('no tiene tipo de movimiento ni medio de pago, y la fecha es "Fecha de pago"', () => {
    renderForm()

    expect(screen.getByLabelText('Fecha de pago')).toBeInTheDocument()
    expect(screen.queryByText('Medio de pago')).not.toBeInTheDocument()
    // La categoría se elige con botones; el tipo y el auto aparecen recién después.
    expect(screen.queryByRole('radiogroup', { name: 'Tipo' })).not.toBeInTheDocument()
  })

  it('pide importe y categoría', async () => {
    const onSubmit = renderForm()

    await save()

    expect(await screen.findByText('Ingresá el importe.')).toBeInTheDocument()
    expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('tarjeta de crédito: muestra los tipos activos y exige elegir uno', async () => {
    const onSubmit = renderForm()

    await choose('Categoría', 'Tarjeta de crédito')

    expect(options('Tipo')).toEqual(['Visa']) // el desactivado (Diners) no se ofrece
    expect(screen.queryByRole('radiogroup', { name: 'Auto' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Importe'), '85.000')
    await save()
    expect(await screen.findByText('Elegí un tipo.')).toBeInTheDocument()

    await choose('Tipo', 'Visa')
    await save()
    expect(onSubmit).toHaveBeenCalledWith(
      {
        amount: '85000.00',
        occurred_on: '2026-10-05',
        category_id: 'c-card',
        item_id: null,
        category_type_id: 't-visa',
        description: null,
        notes: null,
      },
      [],
    )
  })

  it('auto: primero el auto y después el tipo (doble filtro)', async () => {
    const onSubmit = renderForm()

    await choose('Categoría', 'Auto')
    expect(options('Auto')).toEqual(['Fiat Cronos', 'Ford Ka'])
    // Los tipos son comunes a todos los autos (el orden lo define el backend).
    expect(options('Tipo')).toEqual(['Seguro', 'Patente'])

    await userEvent.type(screen.getByLabelText('Importe'), '120000')
    await save()
    expect(await screen.findByText('Elegí qué auto.')).toBeInTheDocument()

    await choose('Auto', 'Fiat Cronos')
    await choose('Tipo', 'Seguro')
    await userEvent.type(screen.getByLabelText('Descripción (opcional)'), 'Cuota octubre')
    await save()

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      category_id: 'c-car',
      item_id: 'i-cronos',
      category_type_id: 't-seguro',
      description: 'Cuota octubre',
    })
  })

  it('al cambiar de categoría se borran el tipo y el auto elegidos', async () => {
    const onSubmit = renderForm()

    await choose('Categoría', 'Auto')
    await choose('Auto', 'Ford Ka')
    await choose('Tipo', 'Patente')
    await choose('Categoría', 'Supermercado')
    await userEvent.type(screen.getByLabelText('Importe'), '15.300,50')
    await save()

    expect(screen.queryByRole('radiogroup', { name: 'Tipo' })).not.toBeInTheDocument()
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      amount: '15300.50',
      category_id: 'c-super',
      item_id: null,
      category_type_id: null,
    })
  })

  it('agrega los puntos de miles mientras se escribe y completa los decimales', async () => {
    renderForm()
    const amount = screen.getByLabelText('Importe')

    await userEvent.type(amount, '10000')
    expect(amount).toHaveValue('10.000')
    await userEvent.tab()
    expect(amount).toHaveValue('10.000,00')

    await userEvent.clear(amount)
    await userEvent.type(amount, '12,345') // no admite más de dos decimales
    expect(amount).toHaveValue('12,34')
  })

  it('el importe tiene que ser mayor a cero', async () => {
    renderForm()

    await userEvent.type(screen.getByLabelText('Importe'), '0')
    await save()

    expect(await screen.findByText('El importe tiene que ser mayor a cero.')).toBeInTheDocument()
  })
})
