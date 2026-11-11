import { LoadingRows } from '@/components/QueryState'
import { StackedColumns } from '@/features/reports/StackedColumns'
import { useServiceHistory } from '@/features/services/useServices'
import { addMonths, monthKey } from '@/lib/dates'

const short = new Intl.DateTimeFormat('es-AR', { month: 'short' })
const long = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })

/**
 * Lo pagado mes a mes en un vencimiento (ej. cuánto vino la luz), para su página de detalle.
 * Sale de los vencimientos pagados, que son del hogar: lo ve igual cualquier integrante, sin
 * importar quién pagó cada mes (los pagos sueltos de cada persona no entran).
 */
export function DueDateHistoryChart({ serviceId }: { serviceId: string }) {
  const { data, isPending } = useServiceHistory(serviceId)
  if (isPending || !data) return <LoadingRows rows={3} />

  // Los últimos 12 meses, sumando lo pagado según el mes del vencimiento.
  const now = new Date()
  const months = Array.from({ length: 12 }, (_, i) => addMonths(new Date(now.getFullYear(), now.getMonth(), 1), i - 11))
  const totals = new Map<string, number>()
  for (const p of data) {
    if (p.amount_paid == null) continue
    const key = p.due_date.slice(0, 7)
    totals.set(key, (totals.get(key) ?? 0) + Number(p.amount_paid))
  }
  // Desde el primer mes con pagos (los meses vacíos del principio solo ocupan lugar).
  const first = months.findIndex((m) => totals.has(monthKey(m)))
  const shown = first < 0 ? months.slice(-3) : months.slice(Math.min(first, months.length - 3))

  return (
    <StackedColumns
      series={[{ key: 'total', label: 'Pagado', color: 'var(--brand)' }]}
      rows={shown.map((m) => {
        const key = monthKey(m)
        return {
          key,
          label: long.format(m),
          short: short.format(m).replace('.', ''),
          values: { total: totals.get(key) ?? 0 },
        }
      })}
    />
  )
}
