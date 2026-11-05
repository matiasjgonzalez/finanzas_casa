import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, House, LoaderCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'

import { FormField } from '@/components/form/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FullScreenLoader } from '@/features/auth/RequireAuth'
import { useLogin, useMe } from '@/features/auth/useAuth'
import { ThemeMenu } from '@/features/theme/ThemeMenu'

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Ingresá tu usuario.'),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
})
type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { data: me, isPending } = useMe()
  const loginMutation = useLogin()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  if (isPending) return <FullScreenLoader />
  if (me) return <Navigate to={from} replace />

  const onSubmit = handleSubmit((values) =>
    loginMutation.mutate(values, {
      onSuccess: () => navigate(from, { replace: true }),
    }),
  )

  // Simple y centrada: el nombre de la app y el formulario, con campos y botón grandes.
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="absolute top-3 right-3">
        <ThemeMenu />
      </div>
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="from-nav-from to-nav-to text-nav-foreground flex size-16 items-center justify-center rounded-2xl bg-gradient-to-b shadow-md">
          <House className="size-8" aria-hidden="true" />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Casa en Orden</h1>
        <p className="text-muted-foreground">Los pagos de la casa, en orden.</p>
      </header>
      <Card className="w-full max-w-md rounded-3xl">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Iniciar sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            {loginMutation.error && (
              <Alert variant="destructive">
                <CircleAlert aria-hidden="true" />
                <AlertDescription>{loginMutation.error.message}</AlertDescription>
              </Alert>
            )}
            <FormField label="Usuario" error={errors.username?.message}>
              <Input
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                className="h-12 text-base"
                {...register('username')}
              />
            </FormField>
            <FormField label="Contraseña" error={errors.password?.message}>
              <Input
                type="password"
                autoComplete="current-password"
                className="h-12 text-base"
                {...register('password')}
              />
            </FormField>
            <Button type="submit" className="h-12 text-base" disabled={loginMutation.isPending}>
              {loginMutation.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Iniciar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-sm">
        ¿No tenés cuenta? Pedísela al administrador del hogar.
      </p>
    </main>
  )
}
