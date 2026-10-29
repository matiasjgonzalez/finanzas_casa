import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, LoaderCircle, Wallet } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'

import { FormField } from '@/components/form/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    loginMutation.mutate(values, { onSuccess: () => navigate(from, { replace: true }) }),
  )

  return (
    <main className="relative flex min-h-svh items-center justify-center p-4">
      <div className="absolute top-3 right-3">
        <ThemeMenu />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="bg-brand mx-auto mb-2 flex size-11 items-center justify-center rounded-xl text-white">
            <Wallet className="size-5" aria-hidden="true" />
          </span>
          <CardTitle className="text-xl">Finanzas Familiares</CardTitle>
          <CardDescription>Iniciá sesión para administrar las finanzas del hogar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
                className="h-10"
                {...register('username')}
              />
            </FormField>
            <FormField label="Contraseña" error={errors.password?.message}>
              <Input
                type="password"
                autoComplete="current-password"
                className="h-10"
                {...register('password')}
              />
            </FormField>
            <Button type="submit" className="h-10" disabled={loginMutation.isPending}>
              {loginMutation.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Iniciar sesión
            </Button>
            <p className="text-muted-foreground text-center text-xs">
              ¿No tenés cuenta? Pedísela al administrador del hogar.
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
