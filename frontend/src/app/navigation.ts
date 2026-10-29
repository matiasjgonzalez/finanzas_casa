import {
  CalendarDays,
  ChartColumn,
  House,
  Building2,
  type LucideIcon,
  PiggyBank,
  ReceiptText,
  Settings,
} from 'lucide-react'

import type { PageKey } from '@/app/pages'
import type { UserRole } from '@/features/auth/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Quién lo ve (es solo visual: el backend igual verifica el permiso). Por defecto, todo el hogar. */
  access?: 'admin' | 'superadmin'
  /** Pantallas que se descargan por adelantado para que abrir la sección sea instantáneo. */
  preload?: PageKey[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: House, preload: ['home'] },
  { to: '/pagos', label: 'Pagos', icon: ReceiptText, preload: ['transactions'] },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays, preload: ['calendarLayout', 'calendar'] },
  { to: '/presupuestos', label: 'Presupuestos', icon: PiggyBank, preload: ['budgets'] },
  { to: '/informes', label: 'Informes', icon: ChartColumn, preload: ['reports'] },
  {
    to: '/administracion',
    label: 'Administración',
    icon: Settings,
    access: 'admin',
    preload: ['adminLayout', 'users'],
  },
  { to: '/hogares', label: 'Hogares', icon: Building2, access: 'superadmin', preload: ['households'] },
]

export function visibleNavItems(role: UserRole): NavItem[] {
  // El superadmin solo administra hogares: no ve las secciones con datos de un hogar.
  if (role === 'superadmin') return NAV_ITEMS.filter((item) => item.access === 'superadmin')
  return NAV_ITEMS.filter(
    (item) => !item.access || (item.access === 'admin' && role === 'admin'),
  )
}
