import { CircleAlert, House, Plus, Settings2 } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { SectionCard } from '@/components/SectionCard'
import { Button } from '@/components/ui/button'
import type { User } from '@/features/auth/types'
import type { HouseholdOverview } from '@/features/households/api'
import { useHouseholdsOverview } from '@/features/households/useHouseholds'
import { RoleBadge, StatusBadge } from '@/features/users/UserBadges'
import { formatDateTime } from '@/lib/format'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Panel del superadmin: cómo están repartidas las cuentas entre los hogares (nada financiero). */
export function HouseholdsPage() {
  const { data: households, error, isPending, refetch } = useHouseholdsOverview()

  return (
    <>
      {/* "Nuevo hogar" está en la barra superior. */}
      <PageHeader
        title="Hogares"
        description="Cada hogar con sus cuentas. Desde acá no se ven sus datos financieros."
      />
      {isPending ? (
        <LoadingRows />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : households.length === 0 ? (
        <SectionCard icon={House} title="Hogares">
          <EmptyState
            icon={House}
            title="Todavía no hay hogares"
            description="Creá el primero con su administrador."
            action={{ to: '/hogares/nuevo', label: 'Nuevo hogar', icon: Plus }}
          />
        </SectionCard>
      ) : (
        <div className="flex flex-col gap-5">
          <Totals households={households} />
          <Warnings households={households} />
          {households.map((h) => (
            <HouseholdCard key={h.id} household={h} />
          ))}
        </div>
      )}
    </>
  )
}

function Totals({ households }: { households: HouseholdOverview[] }) {
  const accounts = households.flatMap((h) => h.members)
  const active = accounts.filter((u) => u.is_active)
  const activeHouseholds = households.filter((h) => h.is_active).length
  const tiles = [
    {
      label: 'Hogares',
      value: households.length,
      detail: activeHouseholds === households.length ? 'todos activos' : `${activeHouseholds} activos`,
    },
    {
      label: 'Cuentas',
      value: accounts.length,
      detail: active.length === accounts.length ? 'todas activas' : `${active.length} activas`,
    },
    {
      label: 'Administradores',
      value: active.filter((u) => u.role === 'admin').length,
      detail: 'activos',
    },
    {
      label: 'Integrantes',
      value: active.filter((u) => u.role === 'member').length,
      detail: 'activos',
    },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="bg-card flex flex-col gap-1 rounded-2xl border px-5 py-4">
          <dt className="text-muted-foreground text-sm">{t.label}</dt>
          <dd className="text-3xl font-semibold tabular-nums">{t.value}</dd>
          <dd className="text-muted-foreground text-xs">{t.detail}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Lo que conviene revisar: hogares sin administrador y cuentas con la contraseña provisoria. */
function Warnings({ households }: { households: HouseholdOverview[] }) {
  const withoutAdmin = households.filter((h) => h.is_active && !h.members.some(isActiveAdmin))
  const pending = households.flatMap((h) => h.members).filter((u) => u.is_active && u.must_change_password).length
  if (!withoutAdmin.length && !pending) return null
  return (
    <ul className="border-warning/40 bg-warning/5 flex flex-col gap-1 rounded-2xl border px-5 py-4 text-sm">
      {withoutAdmin.map((h) => (
        <li key={h.id} className="flex items-center gap-2">
          <CircleAlert className="text-warning size-4 shrink-0" aria-hidden="true" />
          {h.name} no tiene un administrador activo.
        </li>
      ))}
      {pending > 0 && (
        <li className="flex items-center gap-2">
          <CircleAlert className="text-warning size-4 shrink-0" aria-hidden="true" />
          {plural(pending, 'cuenta todavía tiene', 'cuentas todavía tienen')} la contraseña provisoria (no eligieron la
          suya).
        </li>
      )}
    </ul>
  )
}

const isActiveAdmin = (u: User) => u.role === 'admin' && u.is_active

function HouseholdCard({ household: h }: { household: HouseholdOverview }) {
  const admins = h.members.filter((u) => u.role === 'admin').length
  return (
    <SectionCard
      icon={House}
      title={h.name}
      description={`${plural(h.members.length, 'cuenta', 'cuentas')} · ${plural(admins, 'administrador', 'administradores')}`}
      flush
      action={
        <div className="flex items-center gap-3">
          <StatusBadge active={h.is_active} />
          <Button asChild variant="outline" size="sm">
            <Link to={`/hogares/${h.id}`} aria-label={`Gestionar ${h.name}`}>
              <Settings2 aria-hidden="true" />
              <span className="hidden sm:inline">Gestionar</span>
            </Link>
          </Button>
        </div>
      }
    >
      {h.members.length === 0 ? (
        <p className="text-muted-foreground px-5 py-4 text-sm sm:px-6">Sin cuentas.</p>
      ) : (
        <ul className="divide-y" aria-label={`Cuentas de ${h.name}`}>
          {h.members.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <div className={u.is_active ? 'font-medium' : 'text-muted-foreground font-medium'}>{u.full_name}</div>
                <div className="text-muted-foreground text-sm">Usuario: {u.username}</div>
              </div>
              <RoleBadge role={u.role} />
              <div className="flex min-w-36 flex-col items-start text-sm sm:items-end">
                <StatusBadge active={u.is_active} />
                <span className={u.must_change_password ? 'text-warning text-xs' : 'text-muted-foreground text-xs'}>
                  {u.must_change_password
                    ? 'Contraseña provisoria'
                    : u.last_login_at
                      ? `Último ingreso: ${formatDateTime(u.last_login_at)}`
                      : 'Nunca entró'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
