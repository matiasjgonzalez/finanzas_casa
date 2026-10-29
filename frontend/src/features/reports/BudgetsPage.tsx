import { Pencil, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { AmountInput } from '@/components/form/AmountInput'
import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/useAuth'
import type { Category } from '@/features/catalog/api'
import { useCategories } from '@/features/catalog/useCatalog'
import type { Budget } from '@/features/reports/api'
import { BudgetBar } from '@/features/reports/charts'
import { useBreakdown, useBudgets, useSetBudget } from '@/features/reports/useReports'
import { MonthNav } from '@/features/services/MonthCalendar'
import { useCalendarMonth } from '@/features/services/useCalendarMonth'
import { amountToInput, parseAmountInput } from '@/lib/amount'
import { formatMonth, toISODate } from '@/lib/dates'
import { formatMoney } from '@/lib/format'

const sinceText = (iso: string) => formatMonth(new Date(`${iso}T12:00`))

function BudgetForm({
  category,
  month,
  budget,
  onDone,
}: {
  category: Category
  month: string
  budget?: Budget
  onDone: () => void
}) {
  const setBudget = useSetBudget()
  const [amount, setAmount] = useState(budget ? amountToInput(budget.amount) : '')
  const monthName = formatMonth(new Date(`${month}-01T12:00`))

  const save = (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseAmountInput(amount)
    if (!parsed || Number(parsed) <= 0) {
      toast.error('Escribí el límite como 500.000,00.')
      return
    }
    setBudget.mutate(
      { categoryId: category.id, month, amount: parsed },
      {
        onSuccess: () => {
          toast.success(`Presupuesto de «${category.name}» fijado desde ${monthName}.`)
          onDone()
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  const remove = () =>
    setBudget.mutate(
      { categoryId: category.id, month, amount: null },
      {
        onSuccess: () => {
          toast.success(`«${category.name}» ya no tiene presupuesto desde ${monthName}.`)
          onDone()
        },
        onError: (error) => toast.error(error.message),
      },
    )

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <AmountInput
          aria-label={`Límite mensual para ${category.name}`}
          autoFocus
          className="h-9 w-44"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={(e) => setAmount(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={setBudget.isPending}>
          Guardar
        </Button>
        {budget && (
          <Button type="button" size="sm" variant="outline" onClick={remove} disabled={setBudget.isPending}>
            Quitar presupuesto
          </Button>
        )}
        <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Cancelar" onClick={onDone}>
          <X />
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Rige desde {monthName} en adelante; los meses anteriores conservan su límite.
      </p>
    </form>
  )
}

function BudgetRow({
  category,
  month,
  budget,
  spent,
  canEdit,
}: {
  category: Category
  month: string
  budget?: Budget
  spent: string
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  return (
    <li className="flex flex-col gap-2 px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium">{category.name}</span>
        <span className="text-muted-foreground flex items-center gap-2 text-sm tabular-nums">
          {budget ? (
            <>
              {formatMoney(budget.spent)} de {formatMoney(budget.amount)}
            </>
          ) : (
            <>Gastado {formatMoney(spent)} · sin presupuesto</>
          )}
          {canEdit && !editing && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              aria-label={`${budget ? 'Cambiar' : 'Fijar'} presupuesto de ${category.name}`}
            >
              <Pencil aria-hidden="true" /> {budget ? 'Cambiar' : 'Fijar'}
            </Button>
          )}
        </span>
      </div>
      {editing ? (
        <BudgetForm category={category} month={month} budget={budget} onDone={() => setEditing(false)} />
      ) : (
        budget && (
          <>
            <BudgetBar spent={budget.spent} amount={budget.amount} status={budget.status} />
            <p className="text-muted-foreground text-xs first-letter:uppercase">
              Límite vigente desde {sinceText(budget.since)}.
            </p>
          </>
        )
      )}
    </li>
  )
}

export function BudgetsPage() {
  const { isAdmin } = useCurrentUser()
  const { month, key, goTo } = useCalendarMonth()
  const budgets = useBudgets(key)
  const categories = useCategories()
  const spent = useBreakdown({
    group: 'category',
    date_from: toISODate(month),
    date_to: toISODate(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
  })
  const byCategory = new Map(budgets.data?.map((b) => [b.category.id, b]))
  const totalBudget = budgets.data?.reduce((s, b) => s + Number(b.amount), 0) ?? 0
  const totalSpent = budgets.data?.reduce((s, b) => s + Number(b.spent), 0) ?? 0
  // Primero las categorías con presupuesto.
  const rows = [...(categories.data ?? [])].sort(
    (a, b) => Number(byCategory.has(b.id)) - Number(byCategory.has(a.id)),
  )

  return (
    <>
      <PageHeader
        title="Presupuestos"
        description="Un límite mensual por categoría. Avisa al llegar al 80 % y cuando se supera."
      />
      <div className="flex flex-col gap-4">
        <MonthNav month={month} goTo={goTo}>
          {budgets.data && budgets.data.length > 0 && (
            <span className="text-muted-foreground text-sm">
              Presupuestado{' '}
              <span className="text-foreground font-medium tabular-nums">{formatMoney(totalBudget)}</span> · usado{' '}
              <span className="text-foreground font-medium tabular-nums">{formatMoney(totalSpent)}</span>
            </span>
          )}
        </MonthNav>
        {budgets.isPending || categories.isPending ? (
          <LoadingRows rows={4} />
        ) : budgets.error ? (
          <ErrorMessage error={budgets.error} onRetry={() => budgets.refetch()} />
        ) : (
          <Card className="py-0">
            <CardContent className="p-0">
              <ul className="divide-y">
                {rows.map((category) => (
                  <BudgetRow
                    key={`${category.id}-${key}`}
                    category={category}
                    month={key}
                    budget={byCategory.get(category.id)}
                    spent={spent.data?.find((s) => s.id === category.id)?.total ?? '0'}
                    canEdit={isAdmin}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {!isAdmin && (
          <p className="text-muted-foreground text-sm">Los presupuestos los fija un administrador del hogar.</p>
        )}
      </div>
    </>
  )
}
