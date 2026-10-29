import { Pencil, UserPlus } from 'lucide-react'
import { Link } from 'react-router'

import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCurrentUser } from '@/features/auth/useAuth'
import { RoleBadge, StatusBadge } from '@/features/users/UserBadges'
import { useUsers } from '@/features/users/useUsers'
import { formatDateTime } from '@/lib/format'

export function UsersPage() {
  const { data: users, error, isPending, refetch } = useUsers()
  const { user: me } = useCurrentUser()

  return (
    <section aria-labelledby="usuarios-titulo" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="usuarios-titulo" className="text-lg font-semibold">
          Usuarios
        </h2>
        <Button asChild>
          <Link to="usuarios/nuevo">
            <UserPlus aria-hidden="true" />
            Nuevo usuario
          </Link>
        </Button>
      </div>

      <Card className="py-0">
        <CardContent className="p-0">
          {isPending ? (
            <div className="p-4">
              <LoadingRows />
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorMessage error={error} onRetry={() => refetch()} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden lg:table-cell">Último ingreso</TableHead>
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="pl-4">
                      <div className="font-medium">
                        {user.full_name}
                        {user.id === me.id && (
                          <span className="text-muted-foreground font-normal"> (vos)</span>
                        )}
                      </div>
                      <div className="text-muted-foreground text-sm">Usuario: {user.username}</div>
                      <div className="mt-1 md:hidden">
                        <RoleBadge role={user.role} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={user.is_active} />
                      {user.must_change_password && (
                        <div className="text-warning mt-0.5 text-xs">Contraseña provisoria</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">
                      {user.last_login_at ? formatDateTime(user.last_login_at) : 'Nunca'}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`usuarios/${user.id}`} aria-label={`Editar a ${user.full_name}`}>
                          <Pencil aria-hidden="true" />
                          <span className="hidden sm:inline">Editar</span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
