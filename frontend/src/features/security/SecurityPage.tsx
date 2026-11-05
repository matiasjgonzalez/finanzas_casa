import { CircleAlert, Globe, LockOpen, ShieldCheck, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { SectionCard } from '@/components/SectionCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { type LoginAttempt, type Lock, RESULT_LABELS, type SecurityOverview } from '@/features/security/api'
import { describeDevice } from '@/features/security/device'
import { useSecurity, useUnlock } from '@/features/security/useSecurity'
import { formatDateTime } from '@/lib/format'

type Filter = 'all' | 'failed' | 'ok'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'failed', label: 'Solo fallidos' },
  { value: 'ok', label: 'Solo ingresos' },
]

/** Panel del superadmin: quién intentó entrar, bloqueos y avisos. Nada financiero. */
export function SecurityPage() {
  const { data, error, isPending, refetch } = useSecurity()

  return (
    <>
      <PageHeader
        title="Seguridad"
        description="Quién intentó entrar a la app en los últimos 30 días. No incluye datos financieros."
      />
      {isPending ? (
        <LoadingRows />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          <Totals data={data} />
          <YourConnection ip={data.your_ip} />
          <Locks locks={data.locks} />
          <Warnings data={data} />
          <Attempts attempts={data.attempts} />
        </div>
      )}
    </>
  )
}

function Totals({ data: { summary } }: { data: SecurityOverview }) {
  const tiles = [
    { label: 'Ingresos correctos', value: summary.ok },
    { label: 'Intentos fallidos', value: summary.failed },
    { label: 'Rechazados por bloqueo', value: summary.blocked },
    // Va al final porque es una parte de los fallidos, no otra cantidad.
    { label: 'De ellos, con usuario inexistente', value: summary.unknown_user },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="bg-card flex flex-col gap-1 rounded-2xl border px-5 py-4">
          <dt className="text-muted-foreground text-sm">{t.label}</dt>
          <dd className="text-3xl font-semibold tabular-nums">{t.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Para comprobar que detrás del proxy de Railway se registra la IP real de cada persona. */
function YourConnection({ ip }: { ip: string | null }) {
  return (
    <p className="bg-card flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border px-5 py-4 text-sm">
      <Globe className="text-brand size-4 shrink-0" aria-hidden="true" />
      <span>
        La app te ve con la IP <strong className="font-mono">{ip ?? 'desconocida'}</strong>.
      </span>
      <span className="text-muted-foreground">
        Si coincide con la que muestra una página como «cuál es mi IP», la app registra bien desde dónde entra
        cada persona.
      </span>
    </p>
  )
}

function Locks({ locks }: { locks: Lock[] }) {
  const unlock = useUnlock()
  const release = (lock: Lock) =>
    unlock.mutate(lock.kind === 'username' ? { username: lock.value } : { ip_address: lock.value }, {
      onSuccess: () =>
        toast.success(lock.kind === 'username' ? `Se desbloqueó «${lock.value}».` : `Se desbloqueó la IP ${lock.value}.`),
      onError: (e) => toast.error(e.message),
    })
  return (
    <SectionCard
      icon={ShieldAlert}
      title="Bloqueos activos"
      description="Después de varios fallos seguidos la app bloquea por 15 minutos. Se pueden destrabar antes."
      flush
    >
      {locks.length === 0 ? (
        <p className="text-muted-foreground px-5 py-4 text-sm sm:px-6">No hay cuentas ni IP bloqueadas.</p>
      ) : (
        <ul className="divide-y" aria-label="Bloqueos activos">
          {locks.map((lock) => (
            <li key={`${lock.kind}-${lock.value}`} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {lock.kind === 'username' ? `Usuario «${lock.value}»` : `IP ${lock.value}`}
                </div>
                <div className="text-muted-foreground text-sm">
                  {lock.failures} fallos · se libera solo a las{' '}
                  {new Date(lock.unlock_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={unlock.isPending} onClick={() => release(lock)}>
                <LockOpen aria-hidden="true" /> Desbloquear
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function Warnings({ data }: { data: SecurityOverview }) {
  const items: string[] = [
    ...data.suspicious_users.map(
      (u) => `«${u.username}» tuvo ${u.failures} intentos fallidos en las últimas 24 horas.`,
    ),
  ]
  if (data.unknown_usernames.length > 0) {
    const names = data.unknown_usernames.slice(0, 5).map((n) => `«${n}»`).join(', ')
    items.push(
      `Intentaron entrar con usuarios que no existen (${names}${data.unknown_usernames.length > 5 ? '…' : ''}): puede ser alguien probando al azar.`,
    )
  }
  if (data.new_ip_logins > 0) {
    items.push(
      data.new_ip_logins === 1
        ? 'Hubo 1 ingreso desde una IP nueva en los últimos 7 días (marcado abajo).'
        : `Hubo ${data.new_ip_logins} ingresos desde IP nuevas en los últimos 7 días (marcados abajo).`,
    )
  }
  if (items.length === 0) {
    return (
      <p className="bg-card text-muted-foreground flex items-center gap-2 rounded-2xl border px-5 py-4 text-sm">
        <ShieldCheck className="text-positive size-4 shrink-0" aria-hidden="true" />
        Nada fuera de lo común.
      </p>
    )
  }
  return (
    <ul
      className="border-warning/40 bg-warning/5 flex flex-col gap-1.5 rounded-2xl border px-5 py-4 text-sm"
      aria-label="Avisos"
    >
      {items.map((text) => (
        <li key={text} className="flex items-start gap-2">
          <CircleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {text}
        </li>
      ))}
    </ul>
  )
}

function Attempts({ attempts }: { attempts: LoginAttempt[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [household, setHousehold] = useState('')
  const [search, setSearch] = useState('')
  const households = [...new Set(attempts.map((a) => a.household ?? 'Usuario inexistente'))].sort()
  const query = search.trim().toLowerCase()
  const shown = attempts.filter(
    (a) =>
      (filter === 'all' || (filter === 'ok') === (a.result === 'ok')) &&
      (!household || (a.household ?? 'Usuario inexistente') === household) &&
      (!query || a.username.includes(query) || (a.ip_address ?? '').includes(query)),
  )

  return (
    <SectionCard icon={ShieldCheck} title="Intentos de ingreso" description="Los más recientes primero." flush>
      <div className="flex flex-wrap items-end gap-3 border-b px-5 py-4 sm:px-6">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? 'default' : 'outline'}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="seguridad-hogar" className="text-xs">
            Hogar
          </Label>
          <NativeSelect id="seguridad-hogar" value={household} onChange={(e) => setHousehold(e.target.value)}>
            <NativeSelectOption value="">Todos</NativeSelectOption>
            {households.map((h) => (
              <NativeSelectOption key={h} value={h}>
                {h}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor="seguridad-buscar" className="text-xs">
            Usuario o IP
          </Label>
          <Input id="seguridad-buscar" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground px-5 py-4 text-sm sm:px-6">No hay intentos para mostrar.</p>
      ) : (
        <ul className="divide-y" aria-label="Intentos de ingreso">
          {shown.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {a.username}
                  <span className="text-muted-foreground font-normal"> · {a.household ?? 'no existe'}</span>
                </div>
                <div className="text-muted-foreground text-sm">
                  {formatDateTime(a.created_at)} · {describeDevice(a.user_agent)}
                </div>
              </div>
              <div className="flex flex-col items-start gap-1 text-sm sm:items-end">
                <ResultBadge result={a.result} />
                <span className="text-muted-foreground font-mono text-xs">
                  {a.ip_address ?? 'IP desconocida'}
                  {a.new_ip && <span className="text-warning font-sans"> · IP nueva</span>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function ResultBadge({ result }: { result: LoginAttempt['result'] }) {
  const tone =
    result === 'ok'
      ? 'text-positive border-positive/40'
      : result === 'blocked' || result === 'unknown_user'
        ? 'text-destructive border-destructive/40'
        : 'text-warning border-warning/40'
  return (
    <Badge variant="outline" className={tone}>
      {RESULT_LABELS[result] ?? result}
    </Badge>
  )
}
