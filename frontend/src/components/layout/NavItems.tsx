import { NavLink } from 'react-router'

import { type NavItem, visibleNavItems } from '@/app/navigation'
import { preload } from '@/app/pages'
import { navItemClass } from '@/components/layout/navStyles'
import type { UserRole } from '@/features/auth/types'
import { cn } from '@/lib/utils'

/** Aviso numérico junto a una sección (ej. cuentas por pagar). */
export interface NavBadge {
  count: number
  /** Texto para lectores de pantalla (ej. "3 cuentas por pagar"). */
  label: string
  urgent?: boolean
}

interface NavItemsProps {
  role: UserRole
  onNavigate?: () => void
  badges?: Partial<Record<string, NavBadge>>
}

// Rutas que solo se marcan como actuales si coinciden exactamente (si no, "Pagos hechos" se
// marcaría también dentro de "Cargar un pago").
const EXACT = new Set(['/', '/pagos'])

function Item({ item, badge, onNavigate }: { item: NavItem; badge?: NavBadge; onNavigate?: () => void }) {
  const { to, label, icon: Icon, preload: pages = [] } = item
  return (
    <li>
      <NavLink
        to={to}
        end={EXACT.has(to)}
        onClick={onNavigate}
        // Al apuntar con el mouse (o enfocar con teclado) ya se descarga la pantalla.
        onPointerEnter={() => preload(...pages)}
        onFocus={() => preload(...pages)}
        className={({ isActive }) => navItemClass(isActive)}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        {label}
        {badge && badge.count > 0 && (
          <span
            className={cn(
              'ml-auto min-w-6 rounded-full px-1.5 text-center text-sm leading-6 font-semibold',
              badge.urgent ? 'bg-destructive text-destructive-foreground' : 'bg-brand text-brand-foreground',
            )}
          >
            <span aria-hidden="true">{badge.count}</span>
            <span className="sr-only">{badge.label}</span>
          </span>
        )}
      </NavLink>
    </li>
  )
}

export function NavItems({ role, onNavigate, badges = {} }: NavItemsProps) {
  const items = visibleNavItems(role)
  const main = items.filter((i) => i.group !== 'more')
  const more = items.filter((i) => i.group === 'more')
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-1">
        {main.map((item) => (
          <Item key={item.to} item={item} badge={badges[item.to]} onNavigate={onNavigate} />
        ))}
      </ul>
      {more.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-nav-foreground/80 px-3 text-xs font-semibold tracking-wide uppercase">Más opciones</p>
          <ul className="flex flex-col gap-0.5 [&_a]:py-2 [&_a]:text-sm">
            {more.map((item) => (
              <Item key={item.to} item={item} badge={badges[item.to]} onNavigate={onNavigate} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
