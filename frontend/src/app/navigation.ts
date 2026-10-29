import {
  Building2,
  CalendarDays,
  ChartColumn,
  CircleHelp,
  CirclePlus,
  ClipboardList,
  House,
  type LucideIcon,
  PiggyBank,
  ReceiptText,
  Settings,
  UserRound,
  Wallet,
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
  /** "more": va en el grupo "Más opciones", debajo de lo que se usa todos los días. */
  group?: 'more'
  /** Pantallas que se descargan por adelantado para que abrir la sección sea instantáneo. */
  preload?: PageKey[]
}

// Arriba, lo de todos los días con palabras simples; abajo, el resto.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: House, preload: ['home'] },
  { to: '/pagos/nuevo', label: 'Cargar un pago', icon: CirclePlus, preload: ['newTransaction'] },
  { to: '/por-pagar', label: 'Por pagar', icon: ClipboardList, preload: ['toPay'] },
  { to: '/pagos', label: 'Pagos hechos', icon: ReceiptText, preload: ['transactions'] },
  { to: '/gastos', label: 'Cuánto gastamos', icon: Wallet, preload: ['spending'] },
  { to: '/hogares', label: 'Hogares', icon: Building2, access: 'superadmin', preload: ['households'] },
  {
    to: '/calendario',
    label: 'Calendario',
    icon: CalendarDays,
    group: 'more',
    preload: ['calendarLayout', 'calendar'],
  },
  { to: '/presupuestos', label: 'Presupuestos', icon: PiggyBank, group: 'more', preload: ['budgets'] },
  { to: '/informes', label: 'Informes', icon: ChartColumn, group: 'more', preload: ['reports'] },
  {
    to: '/administracion',
    label: 'Administración',
    icon: Settings,
    access: 'admin',
    group: 'more',
    preload: ['adminLayout', 'users'],
  },
  { to: '/cuenta', label: 'Mi cuenta', icon: UserRound, access: 'everyone', group: 'more', preload: ['account'] },
  { to: '/ayuda', label: 'Ayuda', icon: CircleHelp, access: 'everyone', group: 'more', preload: ['help'] },
]

export function visibleNavItems(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.access === 'everyone') return true
    // El superadmin solo administra hogares: no ve las secciones con datos de un hogar.
    if (role === 'superadmin') return item.access === 'superadmin'
    return !item.access || (item.access === 'admin' && role === 'admin')
  })
}
