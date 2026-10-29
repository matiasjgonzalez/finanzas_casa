import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, CircleAlert, LoaderCircle } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { FormField } from '@/components/form/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RoleField } from '@/features/users/RoleField'
import {
  PASSWORD_HINT,
  userCreateSchema,
  type UserCreateValues,
  USERNAME_HINT,
} from '@/features/users/schemas'
import { useUsersScope } from '@/features/users/scope'
import { useCreateUser } from '@/features/users/useUsers'
import { ApiError } from '@/lib/api'

export function NewUserPage() {
  const navigate = useNavigate()
  const createUser = useCreateUser()
  const { home } = useUsersScope()
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UserCreateValues>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { full_name: '', username: '', password: '', role: 'member' },
  })

  const onSubmit = handleSubmit((values) =>
    createUser.mutate(values, {
      onSuccess: (user) => {
        toast.success(`Se creó el usuario de ${user.full_name}.`)
        navigate(home)
      },
      onError: (error) => {
        // Usuario repetido: se muestra junto al campo, que es donde hay que corregirlo.
        if (error instanceof ApiError && error.status === 409) {
          setError('username', { message: error.message })
        }
      },
    }),
  )

  const generalError =
    createUser.error && !(createUser.error instanceof ApiError && createUser.error.status === 409)
      ? createUser.error
      : null

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to={home}>
          <ArrowLeft aria-hidden="true" /> Volver a usuarios
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {generalError && (
              <Alert variant="destructive">
                <CircleAlert aria-hidden="true" />
                <AlertDescription>{generalError.message}</AlertDescription>
              </Alert>
            )}
            <FormField label="Nombre" error={errors.full_name?.message}>
              <Input autoComplete="off" className="h-10" {...register('full_name')} />
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
            <FormField
              label="Contraseña inicial"
              error={errors.password?.message}
              hint={`${PASSWORD_HINT} Es provisoria: la persona deberá cambiarla al ingresar por primera vez.`}
            >
              <Input type="password" autoComplete="new-password" className="h-10" {...register('password')} />
            </FormField>
            <Controller
              control={control}
              name="role"
              render={({ field }) => <RoleField value={field.value} onChange={field.onChange} />}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Crear usuario
              </Button>
              <Button asChild variant="outline">
                <Link to={home}>Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
