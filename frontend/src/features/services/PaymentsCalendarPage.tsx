import { useQuery } from '@tanstack/react-query'
import { ReceiptText } from 'lucide-react'
import { Link } from 'react-router'

import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DayBadge, MonthGrid, MonthNav } from '@/features/services/MonthCalendar'
import { useCalendarMonth } from '@/features/services/useCalendarMonth'
import { listTransactions } from '@/features/transactions/api'
import type { Transaction } from '@/features/transactions/types'
import { TRANSACTIONS_KEY } from '@/features/transactions/useTransactions'
import { formatMoney } from '@/lib/format'

// Un mes completo en una sola consulta (la API admite hasta 500 por página).
const PAGE_SIZE = 500

function label(t: Transaction): string {
  return t.description || [t.category.name, t.item?.name, t.category_type?.name].filter(Boolean).join(' · ')
}

/** Suma exacta de importes en texto ("1234.50"), en centavos para no perder precisión. */
function sum(items: Transaction[]): string {
  const cents = items.reduce((total, t) => total + BigInt(t.amount.replace('.', '')), 0n)
  const text = cents.toString().padStart(3, '0')
  return `${text.slice(0, -2)}.${text.slice(-2)}`
}

function PaymentChip({ t }: { t: Transaction }) {
  return (
    <Link
      to={`/pagos/${t.id}`}
      className="hover:bg-accent flex flex-col rounded-md border px-1.5 py-0.5 text-xs leading-tight"
      title={`${label(t)} · ${formatMoney(t.amount, t.currency)}`}
    >
      <span className="truncate">{label(t)}</span>
      <span className="text-muted-foreground tabular-nums">{formatMoney(t.amount, t.currency)}</span>
    </Link>
  )
}

/** Calendario de pagos realizados: lo que se fue cargando en Pagos, por fecha de pago. */
export function PaymentsCalendarPage() {
  const { month, from, to, key, goTo } = useCalendarMonth()
  const query = { date_from: from, date_to: to, sort: 'date', order: 'asc', page_size: PAGE_SIZE } as const
  const { data, error, isPending, refetch } = useQuery({
    queryKey: [...TRANSACTIONS_KEY, 'calendar', from, to],
    queryFn: () => listTransactions(query),
  })
  const inMonth = (data?.items ?? []).filter((t) => t.occurred_on.startsWith(key))
  const currency = inMonth[0]?.currency

  return (
    <div className="flex flex-col gap-4">
      <MonthNav month={month} goTo={goTo}>
        {inMonth.length > 0 && (
          <span className="text-muted-foreground text-sm">
            {inMonth.length} {inMonth.length === 1 ? 'pago' : 'pagos'} · total{' '}
            <span className="text-foreground font-medium tabular-nums">{formatMoney(sum(inMonth), currency)}</span>
          </span>
        )}
      </MonthNav>

      {isPending ? (
        <LoadingRows rows={5} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {data.total > data.items.length && (
            <p className="text-muted-foreground text-sm">
              Se muestran los primeros {data.items.length} pagos de {data.total}.
            </p>
          )}
          <div className="hidden md:block">
            <MonthGrid
              month={month}
              items={data.items}
              dateOf={(t) => t.occurred_on}
              keyOf={(t) => t.id}
              render={(t) => <PaymentChip t={t} />}
              footer={(items) =>
                items.length > 1 && (
                  <p className="text-muted-foreground text-right text-xs tabular-nums">
                    Total {formatMoney(sum(items), items[0].currency)}
                  </p>
                )
              }
            />
          </div>
          <div className="md:hidden">
            {inMonth.length > 0 && (
              <Card className="py-0">
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {inMonth.map((t) => (
                      <li key={t.id}>
                        <Link to={`/pagos/${t.id}`} className="hover:bg-accent flex items-center gap-3 px-4 py-3">
                          <DayBadge iso={t.occurred_on} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{label(t)}</p>
                            <p className="text-muted-foreground truncate text-xs">{t.created_by.full_name}</p>
                          </div>
                          <span className="text-sm font-medium whitespace-nowrap tabular-nums">
                            {formatMoney(t.amount, t.currency)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
          {inMonth.length === 0 && (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-sm">
              <ReceiptText className="size-7" aria-hidden="true" />
              <p>No hay pagos cargados este mes.</p>
              <Button asChild variant="outline" size="sm">
                <Link to="/pagos/nuevo">Registrar un pago</Link>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
