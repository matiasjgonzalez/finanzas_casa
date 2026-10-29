/**
 * Carga diferida de las pantallas: cada sección se descarga recién cuando hace falta, así el
 * primer ingreso baja mucho menos código. Para que navegar siga siendo instantáneo, las
 * secciones del menú se descargan por adelantado al pasar el mouse o cuando el navegador
 * está libre (ver preloadSections).
 */
import type { ComponentType } from 'react'

type Module = Record<string, unknown>

export const loaders = {
  login: () => import('@/features/auth/LoginPage'),
  forcePasswordChange: () => import('@/features/auth/ForcePasswordChangePage'),
  home: () => import('@/pages/HomePage'),
  transactions: () => import('@/features/transactions/TransactionsPage'),
  newTransaction: () => import('@/features/transactions/NewTransactionPage'),
  editTransaction: () => import('@/features/transactions/EditTransactionPage'),
  calendarLayout: () => import('@/features/services/CalendarLayout'),
  calendar: () => import('@/features/services/CalendarPage'),
  services: () => import('@/features/services/ServicesPages'),
  period: () => import('@/features/services/PeriodPage'),
  paymentsCalendar: () => import('@/features/services/PaymentsCalendarPage'),
  toPay: () => import('@/features/services/ToPayPage'),
  spending: () => import('@/features/reports/SpendingPage'),
  budgets: () => import('@/features/reports/BudgetsPage'),
  account: () => import('@/features/auth/AccountPage'),
  help: () => import('@/pages/HelpPage'),
  adminLayout: () => import('@/features/admin/AdminLayout'),
  users: () => import('@/features/users/UsersPage'),
  newUser: () => import('@/features/users/NewUserPage'),
  editUser: () => import('@/features/users/EditUserPage'),
  categories: () => import('@/features/catalog/CategoriesAdminPage'),
  audit: () => import('@/features/audit/AuditLogPage'),
  households: () => import('@/features/households/HouseholdsPage'),
  newHousehold: () => import('@/features/households/NewHouseholdPage'),
  householdLayout: () => import('@/features/households/HouseholdLayout'),
} satisfies Record<string, () => Promise<Module>>

export type PageKey = keyof typeof loaders

/** Para `lazy` de React Router: toma el componente exportado con ese nombre. */
export function lazyPage(key: PageKey, name: string) {
  return async () => ({ Component: (await loaders[key]())[name as never] as ComponentType })
}

const started = new Set<PageKey>()

/** Descarga (una sola vez) el código de las pantallas indicadas. Los errores se ignoran: si
 * falla, la pantalla se vuelve a pedir al entrar. */
export function preload(...keys: PageKey[]) {
  for (const key of keys) {
    if (started.has(key)) continue
    started.add(key)
    loaders[key]().catch(() => started.delete(key))
  }
}

/** Cuando el navegador está libre, descarga las secciones que se usan a diario. */
export function preloadSections(keys: PageKey[]) {
  const run = () => preload(...keys)
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1500)
}
