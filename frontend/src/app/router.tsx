import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'

import { lazyPage } from '@/app/pages'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  FullScreenLoader,
  RequireAdmin,
  RequireAuth,
  RequireHousehold,
  RequireSuperadmin,
} from '@/features/auth/RequireAuth'
import { NotFoundPage, RouteErrorPage } from '@/pages/ErrorPages'

// Solo el marco de la aplicación se carga siempre; cada pantalla se descarga cuando se usa por
// primera vez (ver app/pages.ts).
export const routes: RouteObject[] = [
  {
    path: '/login',
    lazy: lazyPage('login', 'LoginPage'),
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <FullScreenLoader />,
  },
  {
    // Todo lo que está dentro requiere sesión iniciada.
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <FullScreenLoader />,
    children: [
      { path: 'cambiar-contrasena', lazy: lazyPage('forcePasswordChange', 'ForcePasswordChangePage') },
      {
        element: <AppLayout />,
        children: [
          { path: 'cuenta', lazy: lazyPage('account', 'AccountPage') },
          { path: 'ayuda', lazy: lazyPage('help', 'HelpPage') },
          {
            // Administración de hogares: solo el superadmin.
            path: 'hogares',
            element: <RequireSuperadmin />,
            children: [
              { index: true, lazy: lazyPage('households', 'HouseholdsPage') },
              { path: 'nuevo', lazy: lazyPage('newHousehold', 'NewHouseholdPage') },
              {
                path: ':householdId',
                lazy: lazyPage('householdLayout', 'HouseholdLayout'),
                children: [
                  { index: true, lazy: lazyPage('users', 'UsersPage') },
                  { path: 'usuarios/nuevo', lazy: lazyPage('newUser', 'NewUserPage') },
                  { path: 'usuarios/:userId', lazy: lazyPage('editUser', 'EditUserPage') },
                ],
              },
            ],
          },
          {
            // Datos de un hogar: el superadmin no entra (va a Hogares).
            element: <RequireHousehold />,
            children: [
              { index: true, lazy: lazyPage('home', 'HomePage') },
              { path: 'pagos', lazy: lazyPage('transactions', 'TransactionsPage') },
              { path: 'por-pagar', lazy: lazyPage('toPay', 'ToPayPage') },
              { path: 'gastos', lazy: lazyPage('spending', 'SpendingPage') },
              { path: 'pagos/nuevo', lazy: lazyPage('newTransaction', 'NewTransactionPage') },
              {
                path: 'pagos/:transactionId',
                lazy: lazyPage('editTransaction', 'EditTransactionPage'),
              },
              {
                path: 'calendario',
                lazy: lazyPage('calendarLayout', 'CalendarLayout'),
                children: [
                  { index: true, lazy: lazyPage('calendar', 'CalendarPage') },
                  { path: 'pagos', lazy: lazyPage('paymentsCalendar', 'PaymentsCalendarPage') },
                  { path: 'servicios', lazy: lazyPage('services', 'ServicesPage') },
                  { path: 'servicios/:serviceId', lazy: lazyPage('services', 'ServiceDetailPage') },
                  { path: 'vencimientos/:periodId', lazy: lazyPage('period', 'PeriodPage') },
                ],
              },
              { path: 'presupuestos', lazy: lazyPage('budgets', 'BudgetsPage') },
              // Informes se quitó: lo del día a día está en "Cuánto gastamos".
              { path: 'informes', element: <Navigate to="/gastos" replace /> },
              {
                path: 'categorias',
                element: <RequireAdmin />,
                children: [{ index: true, lazy: lazyPage('categories', 'CategoriesAdminPage') }],
              },
              {
                path: 'administracion',
                element: <RequireAdmin />,
                children: [
                  {
                    lazy: lazyPage('adminLayout', 'AdminLayout'),
                    children: [
                      { index: true, lazy: lazyPage('users', 'UsersPage') },
                      { path: 'usuarios/nuevo', lazy: lazyPage('newUser', 'NewUserPage') },
                      { path: 'usuarios/:userId', lazy: lazyPage('editUser', 'EditUserPage') },
                      // Categorías pasó al menú principal (se mantiene la dirección vieja).
                      { path: 'categorias', element: <Navigate to="/categorias" replace /> },
                      { path: 'historial', lazy: lazyPage('audit', 'AuditLogPage') },
                    ],
                  },
                ],
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
