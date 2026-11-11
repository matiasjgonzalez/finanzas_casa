import { KeyRound, LogOut } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm'
import { useCurrentUser, useLogout } from '@/features/auth/useAuth'
import { PASSWORD_HINT } from '@/features/users/schemas'
import { ThemeMenu } from '@/features/theme/ThemeMenu'

/** Pantalla obligatoria cuando la contraseña fue asignada por otra persona (o es la inicial). */
export function ForcePasswordChangePage() {
  const { user } = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()

  if (!user.must_change_password) return <Navigate to="/" replace />

  return (
    <main className="relative flex min-h-svh items-center justify-center p-4">
      <div className="absolute top-3 right-3">
        <ThemeMenu />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <span className="bg-brand text-brand-foreground mb-2 flex size-11 items-center justify-center rounded-xl">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <CardTitle className="text-xl">Cambiá tu contraseña</CardTitle>
          <CardDescription>
            Hola, {user.full_name}. Tu contraseña actual es provisoria: elegí una nueva para empezar a
            usar la aplicación. {PASSWORD_HINT}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ChangePasswordForm
            submitLabel="Guardar y continuar"
            onSuccess={() => {
              toast.success('Listo, tu contraseña quedó actualizada.')
              navigate('/', { replace: true })
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
          >
            <LogOut aria-hidden="true" /> Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
