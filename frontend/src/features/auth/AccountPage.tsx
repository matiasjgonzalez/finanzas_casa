import { KeyRound, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/PageHeader'
import { SectionCard } from '@/components/SectionCard'
import { Badge } from '@/components/ui/badge'
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm'
import { useCurrentUser } from '@/features/auth/useAuth'
import type { ThemePreference } from '@/features/theme/theme'
import { useTheme } from '@/features/theme/useTheme'
import { PASSWORD_HINT, ROLE_LABELS } from '@/features/users/schemas'
import { cn } from '@/lib/utils'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'system', label: 'Según el dispositivo', icon: Monitor },
]

export function AccountPage() {
  const { user, household } = useCurrentUser()
  const { preference, setPreference } = useTheme()

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="Mi cuenta" description="Tus datos, la apariencia de la app y tu contraseña." />

      {/* Perfil */}
      <section className="bg-card flex flex-wrap items-center gap-4 rounded-3xl border p-5 sm:p-6">
        <span className="bg-brand flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white">
          {initials(user.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{user.full_name}</h2>
            <Badge variant="outline" className="border-brand/50 text-brand">
              {ROLE_LABELS[user.role]}
            </Badge>
          </div>
          <dl className="text-muted-foreground mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-1.5">
              <dt>Usuario:</dt>
              <dd className="text-foreground break-all">{user.username}</dd>
            </div>
            {household && (
              <div className="flex gap-1.5">
                <dt>Hogar:</dt>
                <dd className="text-foreground">{household.name}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      <SectionCard icon={Palette} title="Apariencia" description="Se guarda en este dispositivo.">
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tema">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={preference === value}
              onClick={() => setPreference(value)}
              className={cn(
                'focus-visible:ring-ring/50 flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-3',
                preference === value ? 'border-brand bg-brand/10' : 'hover:bg-accent',
              )}
            >
              <Icon className={cn('size-4', preference === value ? 'text-brand' : 'text-muted-foreground')} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard icon={KeyRound} title="Cambiar contraseña" description={PASSWORD_HINT}>
        <ChangePasswordForm
          onSuccess={() => toast.success('Contraseña actualizada. Se cerraron tus sesiones en otros dispositivos.')}
        />
      </SectionCard>
    </div>
  )
}
