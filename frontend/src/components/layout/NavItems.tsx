import { NavLink } from 'react-router'

import { visibleNavItems } from '@/app/navigation'
import { preload } from '@/app/pages'
import type { UserRole } from '@/features/auth/types'
import { navItemClass } from '@/components/layout/navStyles'
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
              className={({ isActive }) => navItemClass(isActive)}
            >
              <Icon className="size-[18px] shrink-0" aria-hidden="true" />
              {label}
              {badge && badge.count > 0 && (
                <span
                  className={cn(
                    'ml-auto min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold text-white',
                    badge.urgent ? 'bg-destructive' : 'bg-brand',
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
