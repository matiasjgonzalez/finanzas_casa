import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, CircleAlert, KeyRound, LoaderCircle } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/form/FormField'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { User } from '@/features/auth/types'
import { useCurrentUser } from '@/features/auth/useAuth'
import { RoleField } from '@/features/users/RoleField'
import {
  PASSWORD_HINT,
  passwordSchema,
  userEditSchema,
  type UserEditValues,
  USERNAME_HINT,
} from '@/features/users/schemas'
import { useUsersScope } from '@/features/users/scope'
import { StatusBadge } from '@/features/users/UserBadges'
import { useResetPassword, useUpdateUser, useUser } from '@/features/users/useUsers'
import { ApiError } from '@/lib/api'

function ProfileForm({ user }: { user: User }) {
  const updateUser = useUpdateUser(user.id)
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<UserEditValues>({
    resolver: zodResolver(userEditSchema),
    values: {
      full_name: user.full_name,
      username: user.username,
      role: user.role === 'admin' ? 'admin' : 'member',
    },
  })

  const onSubmit = handleSubmit((values) =>
    updateUser.mutate(values, {
      onSuccess: () => toast.success('Cambios guardados.'),
      onError: (error) => {
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          error.message.includes('nombre de usuario')
        ) {
          setError('username', { message: error.message })
        }
      },
    }),
  )

  const showGeneralError = updateUser.error && !errors.username

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {showGeneralError && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{updateUser.error?.message}</AlertDescription>
            </Alert>
          )}
          <FormField label="Nombre" error={errors.full_name?.message}>
            <Input className="h-10" {...register('full_name')} />
          </FormField>
          <FormField label="Usuario" error={errors.username?.message} hint={USERNAME_HINT}>
            <Input
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10"
              {...register('username')}
            />
          </FormField>
          <Controller
            control={control}
            name="role"
            render={({ field }) => <RoleField value={field.value} onChange={field.onChange} />}
          />
          <Button type="submit" className="self-start" disabled={!isDirty || updateUser.isPending}>
            {updateUser.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Guardar cambios
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function AccessCard({ user, isSelf }: { user: User; isSelf: boolean }) {
  const updateUser = useUpdateUser(user.id)

  const toggle = (active: boolean) =>
    updateUser.mutate(
      { is_active: active },
      {
        onSuccess: () =>
          toast.success(active ? 'La cuenta fue activada.' : 'La cuenta fue desactivada.'),
        onError: (error) => toast.error(error.message),
      },
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acceso</CardTitle>
        <CardDescription>
          Una cuenta desactivada no puede iniciar sesión, pero sus pagos se conservan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Switch
            id="cuenta-activa"
            checked={user.is_active}
            onCheckedChange={toggle}
            disabled={updateUser.isPending}
          />
          <Label htmlFor="cuenta-activa">Cuenta activa</Label>
        </div>
        <StatusBadge active={user.is_active} />
      </CardContent>
      {isSelf && user.is_active && (
        <CardContent>
          <p className="text-muted-foreground text-xs">
            Es tu propia cuenta: si la desactivás, se cerrará tu sesión.
          </p>
        </CardContent>
      )}
    </Card>
  )
}

const resetSchema = z.object({ new_password: passwordSchema })

function ResetPasswordCard({ user }: { user: User }) {
  const resetPassword = useResetPassword(user.id)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { new_password: '' },
  })

  const onSubmit = handleSubmit(({ new_password }) =>
    resetPassword.mutate(new_password, {
      onSuccess: () => {
        reset()
        toast.success(`Contraseña actualizada. Se cerraron las sesiones de ${user.full_name}.`)
      },
      onError: (error) => toast.error(error.message),
    }),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restablecer contraseña</CardTitle>
        <CardDescription>
          Útil si la persona olvidó su contraseña. Se cerrarán todas sus sesiones abiertas y deberá
          cambiar esta contraseña provisoria al ingresar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormField label="Nueva contraseña" error={errors.new_password?.message} hint={PASSWORD_HINT}>
            <Input type="password" autoComplete="new-password" className="h-10" {...register('new_password')} />
          </FormField>
          <Button type="submit" variant="outline" className="self-start" disabled={resetPassword.isPending}>
            <KeyRound aria-hidden="true" />
            Asignar contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function EditUserPage() {
  const { userId = '' } = useParams()
  const { data: user, error, isPending, refetch } = useUser(userId)
  const { user: me } = useCurrentUser()
  const { home } = useUsersScope()

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to={home}>
          <ArrowLeft aria-hidden="true" /> Volver a usuarios
        </Link>
      </Button>
      {isPending ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <h2 className="text-lg font-semibold">{user.full_name}</h2>
          <ProfileForm user={user} />
          <AccessCard user={user} isSelf={user.id === me.id} />
          <ResetPasswordCard user={user} />
        </>
      )}
    </div>
  )
}
