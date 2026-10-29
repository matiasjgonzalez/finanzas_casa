import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarClock, ChartColumn, CircleAlert, LoaderCircle, ReceiptText, Wallet } from 'lucide-react'
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
    loginMutation.mutate(values, {
      onSuccess: () => navigate(from, { replace: true }),
    }),
  )

  return (
    <main className="relative flex min-h-svh md:gap-6 md:p-4">
      <div className="absolute top-3 right-3 z-10">
        <ThemeMenu />
      </div>
      {/* Panel de presentación (computadora): el mismo degradé del menú de la aplicación. */}
      <aside className="from-nav-from to-nav-to text-nav-foreground hidden w-[42%] max-w-xl flex-col justify-between rounded-3xl bg-gradient-to-b p-10 shadow-xl md:flex">
        <div className="flex items-center gap-3">
          <span className="bg-brand flex size-11 items-center justify-center rounded-xl text-white shadow-sm">
            <Wallet className="size-5" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-semibold">Casa en Orden</span>
            <span className="text-nav-foreground/70 text-sm">Finanzas familiares</span>
          </span>
        </div>
        <div className="flex flex-col gap-6">
          <p className="text-3xl leading-tight font-semibold">
            Los pagos de la casa, en orden y en un solo lugar.
          </p>
          <ul className="text-nav-foreground/85 flex flex-col gap-4 text-sm">
            {[
              {
                icon: ReceiptText,
                text: 'Cada pago con su comprobante, cargado desde el celular.',
              },
              {
                icon: CalendarClock,
                text: 'Avisos de vencimientos para no pagar recargos.',
              },
              {
                icon: ChartColumn,
                text: 'Presupuestos e informes para saber a dónde va la plata.',
              },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-nav-foreground/50 text-xs">Uso privado de la familia.</p>
      </aside>
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-sm rounded-3xl">
          <CardHeader className="items-center text-center">
            <span className="bg-brand mx-auto mb-2 flex size-11 items-center justify-center rounded-xl text-white md:hidden">
              <Wallet className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="text-xl">Iniciar sesión</CardTitle>
            <CardDescription>Ingresá con tu usuario de Casa en Orden.</CardDescription>
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
      </div>
    </main>
  )
}
