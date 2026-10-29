import { Bell, CalendarClock, CircleHelp, Plus } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCurrentUser } from '@/features/auth/useAuth'
import { PeriodStatusBadge } from '@/features/services/PeriodStatusBadge'
import { useAlerts } from '@/features/services/useServices'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Campana con los vencimientos vencidos o por vencer esta semana. */
function NotificationsBell() {
  const { data } = useAlerts(7)
  const count = data ? data.overdue + data.due_soon : 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={count ? `Notificaciones: ${count} vencimientos por atender` : 'Notificaciones'}
        >
          <Bell />
          {count > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold text-white',
                data && data.overdue > 0 ? 'bg-destructive' : 'bg-brand',
              )}
              aria-hidden="true"
            >
              {count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Vencimientos por atender</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!data?.items.length ? (
          <p className="text-muted-foreground px-2 py-3 text-sm">No hay vencimientos pendientes esta semana.</p>
        ) : (
          data.items.slice(0, 6).map((p) => (
            <DropdownMenuItem key={p.id} asChild>
              <Link to={`/calendario/vencimientos/${p.id}`} className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.service.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {formatDate(p.due_date)}
                    {p.amount_due && ` · ${formatMoney(p.amount_due, p.currency)}`}
                  </span>
                </span>
                <PeriodStatusBadge status={p.status} />
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/calendario" className="text-brand justify-center font-semibold">
            <CalendarClock aria-hidden="true" /> Ver calendario
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Barra superior: saludo, ayuda, notificaciones y la acción principal. */
export function TopBar() {
  const { user, isSuperadmin } = useCurrentUser()
  const firstName = user.full_name.split(' ')[0]

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4 md:mb-8 md:min-h-[72px]">
      <div className="flex items-center gap-1">
        <p className="mr-2 text-lg sm:text-xl">
          Hola, <span className="text-brand font-semibold">{firstName}</span>
        </p>
        <Button asChild variant="ghost" size="icon" className="rounded-full" aria-label="Ayuda">
          <Link to="/ayuda">
            <CircleHelp />
          </Link>
        </Button>
        {!isSuperadmin && <NotificationsBell />}
      </div>
      {isSuperadmin ? (
        <Button asChild size="lg" className="hidden md:inline-flex">
          <Link to="/hogares/nuevo">
            <Plus aria-hidden="true" /> Nuevo hogar
          </Link>
        </Button>
      ) : (
        <Button asChild size="lg" className="hidden md:inline-flex">
          <Link to="/pagos/nuevo">
            <Plus aria-hidden="true" /> Nuevo pago
          </Link>
        </Button>
      )}
    </div>
  )
}
