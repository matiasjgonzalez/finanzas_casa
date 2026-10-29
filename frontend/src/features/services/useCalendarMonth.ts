import { useSearchParams } from 'react-router'

import { monthGrid, monthKey, parseMonth, toISODate } from '@/lib/dates'

/** Mes elegido (en la URL: ?mes=AAAA-MM) y el rango de días que muestra la grilla. */
export function useCalendarMonth() {
  const [params, setParams] = useSearchParams()
  const month = parseMonth(params.get('mes'))
  const grid = monthGrid(month)
  return {
    month,
    from: toISODate(grid[0]),
    to: toISODate(grid.at(-1)!),
    key: monthKey(month),
    goTo: (target: Date) => setParams({ mes: monthKey(target) }, { replace: true }),
  }
}
