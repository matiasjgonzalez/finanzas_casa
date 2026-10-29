import { LoadingRows } from '@/components/QueryState'
import { StackedColumns } from '@/features/reports/StackedColumns'
import { useMonthly } from '@/features/reports/useReports'
import { monthKey } from '@/lib/dates'

const short = new Intl.DateTimeFormat('es-AR', { month: 'short' })
const long = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })
const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00`)

/** Lo pagado mes a mes en un vencimiento (ej. cuánto vino la luz), para su página de detalle. */
export function DueDateHistoryChart({
  categoryId,
  typeId,
  itemId,
}: {
  categoryId: string
  typeId?: string
  itemId?: string
}) {
  const { data, isPending } = useMonthly({
    until: monthKey(new Date()),
    months: 12,
    category_id: categoryId,
    category_type_id: typeId,
    item_id: itemId,
  })
  if (isPending || !data) return <LoadingRows rows={3} />
  // Desde el primer mes con pagos (los meses vacíos del principio solo ocupan lugar).
  const first = data.findIndex((m) => Number(m.total) > 0)
  const months = first < 0 ? data.slice(-3) : data.slice(Math.min(first, Math.max(data.length - 3, 0)))
  return (
    <StackedColumns
      series={[{ key: 'total', label: 'Pagado', color: 'var(--brand)' }]}
      rows={months.map((m) => ({
        key: m.month,
        label: long.format(asDate(m.month)),
        short: short.format(asDate(m.month)).replace('.', ''),
        values: { total: Number(m.total) },
      }))}
    />
  )
}
