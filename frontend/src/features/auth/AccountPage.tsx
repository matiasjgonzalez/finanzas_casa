import { toast } from 'sonner'

import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm'
import { useCurrentUser } from '@/features/auth/useAuth'
import { PASSWORD_HINT, ROLE_LABELS } from '@/features/users/schemas'

export function AccountPage() {
  const { user, household } = useCurrentUser()

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader title="Mi cuenta" />
      <Card>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Nombre</dt>
            <dd>{user.full_name}</dd>
            <dt className="text-muted-foreground">Usuario</dt>
            <dd className="break-all">{user.username}</dd>
            <dt className="text-muted-foreground">Rol</dt>
            <dd>{ROLE_LABELS[user.role]}</dd>
            {household && (
              <>
                <dt className="text-muted-foreground">Hogar</dt>
                <dd>{household.name}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>{PASSWORD_HINT}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm
            onSuccess={() =>
              toast.success('Contraseña actualizada. Se cerraron tus sesiones en otros dispositivos.')
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
