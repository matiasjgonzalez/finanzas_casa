import { LogOut, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCurrentUser, useLogout } from '@/features/auth/useAuth'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, household } = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={compact ? 'size-9 rounded-full p-0' : 'h-auto w-full justify-start gap-3 px-2 py-2'}
          aria-label={`Menú de ${user.full_name}`}
        >
          <span className="bg-secondary text-secondary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
            {initials(user.full_name)}
          </span>
          {!compact && (
            <span className="flex min-w-0 flex-col items-start text-left">
              <span className="w-full truncate text-sm font-medium">{user.full_name}</span>
              <span className="text-muted-foreground w-full truncate text-xs">{household?.name ?? 'Administración de hogares'}</span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? 'end' : 'start'} className="w-56">
        <DropdownMenuLabel className="truncate">Usuario: {user.username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/cuenta')}>
          <UserRound aria-hidden="true" /> Mi cuenta
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
        >
          <LogOut aria-hidden="true" /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
