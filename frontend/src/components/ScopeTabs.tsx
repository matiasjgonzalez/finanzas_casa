import { House, UserRound } from 'lucide-react'

import { useCurrentUser } from '@/features/auth/useAuth'
import type { Scope } from '@/lib/scope'
import { cn } from '@/lib/utils'

const TABS = [
  { value: 'mine', label: 'Mis gastos', icon: UserRound },
  { value: 'household', label: 'Gastos del hogar', icon: House },
] as const

/**
 * Pestañas "Mis gastos" / "Gastos del hogar". Solo las ve un administrador: un integrante ve
 * únicamente lo suyo (y el servidor tampoco le entrega lo de los demás).
 */
export function ScopeTabs({ scope, onChange }: { scope: Scope; onChange: (scope: Scope) => void }) {
  const { isAdmin } = useCurrentUser()
  if (!isAdmin) return null
  return (
    <div role="tablist" aria-label="De quién son los gastos" className="flex gap-1 border-b">
      {TABS.map(({ value, label, icon: Icon }) => {
        const selected = scope === value
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(value)}
            className={cn(
              'focus-visible:ring-ring/50 -mb-px inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-3 text-base font-medium outline-none focus-visible:ring-3',
              selected
                ? 'border-brand text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
