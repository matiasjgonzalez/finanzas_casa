import {
  Building2,
  CalendarDays,
  ChartColumn,
  CircleHelp,
  House,
  type LucideIcon,
  PiggyBank,
  ReceiptText,
  Settings,
  UserRound,
} from 'lucide-react'

import type { PageKey } from '@/app/pages'
import type { UserRole } from '@/features/auth/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /**
   * Quién lo ve (es solo visual: el backend igual verifica el permiso). Por defecto, los
   * integrantes de un hogar; "everyone" incluye al superadmin.
   */
  access?: 'admin' | 'superadmin' | 'everyone'
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
  { to: '/cuenta', label: 'Mi cuenta', icon: UserRound, access: 'everyone', preload: ['account'] },
  { to: '/ayuda', label: 'Ayuda', icon: CircleHelp, access: 'everyone', preload: ['help'] },
]

export function visibleNavItems(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.access === 'everyone') return true
    // El superadmin solo administra hogares: no ve las secciones con datos de un hogar.
    if (role === 'superadmin') return item.access === 'superadmin'
    return !item.access || (item.access === 'admin' && role === 'admin')
  })
}
