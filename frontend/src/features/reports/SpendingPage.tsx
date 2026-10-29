import { ChartPie, ReceiptText } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { SectionCard } from '@/components/SectionCard'
import { BarList } from '@/features/reports/charts'
import { useSummary } from '@/features/reports/useReports'
import { MonthNav } from '@/features/services/MonthCalendar'
import { useCalendarMonth } from '@/features/services/useCalendarMonth'
import { formatMonth } from '@/lib/dates'
import { formatMoney } from '@/lib/format'

/** Comparación con el mes anterior, en una frase. */
function comparison(total: number, previous: number): string | null {
  if (previous === 0) return null
  const diff = total - previous
  if (diff === 0) return 'Lo mismo que el mes anterior.'
  return `${formatMoney(Math.abs(diff))} ${diff > 0 ? 'más' : 'menos'} que el mes anterior (${formatMoney(previous)}).`
}

/** Cuánto se gastó en el mes y en qué, sin gráficos complicados. */
export function SpendingPage() {
  const { month, key, goTo } = useCalendarMonth()
  const { data, error, isPending, refetch } = useSummary(key)
  const total = Number(data?.total ?? 0)
  const sentence = data ? comparison(total, Number(data.previous_total)) : null

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Cuánto gastamos" description="El total del mes y en qué se gastó." />
      <MonthNav month={month} goTo={goTo} />
      {isPending ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <section className="bg-card rounded-3xl border p-6 sm:p-8">
            <p className="text-muted-foreground text-lg first-letter:uppercase">En {formatMonth(month)} gastamos</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
              {formatMoney(data.total)}
            </p>
            <p className="text-muted-foreground mt-2">
              En {data.count} {data.count === 1 ? 'pago' : 'pagos'}.
              {sentence && <> {sentence}</>}
            </p>
          </section>
          <SectionCard
            icon={ChartPie}
            title="En qué se gastó"
            footer={{ to: '/pagos', label: 'Ver todos los pagos', icon: ReceiptText }}
          >
            {data.by_category.length ? (
              <BarList items={data.by_category} />
            ) : (
              <EmptyState
                icon={ChartPie}
                title="No hay pagos este mes"
                action={{ to: '/pagos/nuevo', label: 'Cargar un pago' }}
              />
            )}
          </SectionCard>
          <Link to="/informes" className="text-brand self-start text-sm font-semibold hover:underline">
            Ver informes más detallados
          </Link>
        </>
      )}
    </div>
  )
}
