import { NavLink } from 'react-router'

import { visibleNavItems } from '@/app/navigation'
import { preload } from '@/app/pages'
import type { UserRole } from '@/features/auth/types'
import { cn } from '@/lib/utils'

/** Aviso numérico junto a una sección (ej. vencimientos por atender en Calendario). */
export interface NavBadge {
  count: number
  /** Texto para lectores de pantalla (ej. "3 vencimientos por atender"). */
  label: string
  urgent?: boolean
}

interface NavItemsProps {
  role: UserRole
  onNavigate?: () => void
  badges?: Partial<Record<string, NavBadge>>
}

export function NavItems({ role, onNavigate, badges = {} }: NavItemsProps) {
  return (
    <ul className="flex flex-col gap-1">
      {visibleNavItems(role).map(({ to, label, icon: Icon, preload: pages = [] }) => {
        const badge = badges[to]
        return (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              onClick={onNavigate}
              // Al apuntar con el mouse (o enfocar con teclado) ya se descarga la pantalla.
              onPointerEnter={() => preload(...pages)}
              onFocus={() => preload(...pages)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:ring-ring/50 outline-none focus-visible:ring-3',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
              {badge && badge.count > 0 && (
                <span
                  className={cn(
                    'ml-auto min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold',
                    badge.urgent ? 'bg-destructive text-white' : 'bg-brand text-white',
                  )}
                >
                  <span aria-hidden="true">{badge.count}</span>
                  <span className="sr-only">{badge.label}</span>
                </span>
              )}
            </NavLink>
          </li>
        )
      })}
    </ul>
  )
}
