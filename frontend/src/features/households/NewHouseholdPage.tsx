import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, CircleAlert, LoaderCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/form/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useCreateHousehold } from '@/features/households/useHouseholds'
import { PASSWORD_HINT, passwordSchema, USERNAME_HINT, usernameSchema } from '@/features/users/schemas'
import { ApiError } from '@/lib/api'

const schema = z.object({
  name: z.string().trim().min(1, 'Ingresá el nombre del hogar.').max(120, 'Máximo 120 caracteres.'),
  admin_full_name: z.string().trim().min(1, 'Ingresá el nombre.').max(120, 'Máximo 120 caracteres.'),
  admin_username: usernameSchema,
  admin_password: passwordSchema,
})
type Values = z.infer<typeof schema>

export function NewHouseholdPage() {
  const navigate = useNavigate()
  const create = useCreateHousehold()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', admin_full_name: '', admin_username: '', admin_password: '' },
  })

  const onSubmit = handleSubmit((values) =>
    create.mutate(values, {
      onSuccess: (household) => {
        toast.success(`Se creó el hogar «${household.name}».`)
        navigate(`/hogares/${household.id}`)
      },
      onError: (error) => {
        // Nombre repetido (de hogar o de usuario): se muestra junto al campo que hay que corregir.
        if (error instanceof ApiError && error.status === 409) {
          setError(error.message.includes('usuario') ? 'admin_username' : 'name', {
            message: error.message,
          })
        }
      },
    }),
  )

  const generalError =
    create.error && !(create.error instanceof ApiError && create.error.status === 409)
      ? create.error
      : null

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/hogares">
          <ArrowLeft aria-hidden="true" /> Volver a hogares
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo hogar</CardTitle>
          <CardDescription>
            Se crea con las categorías Tarjeta de crédito, Servicio y Auto (vacías) y con su
            administrador, que después agrega a los demás integrantes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {generalError && (
              <Alert variant="destructive">
                <CircleAlert aria-hidden="true" />
                <AlertDescription>{generalError.message}</AlertDescription>
              </Alert>
            )}
            <FormField label="Nombre del hogar" error={errors.name?.message}>
              <Input autoComplete="off" className="h-10" {...register('name')} />
            </FormField>
            <Separator />
            <p className="text-sm font-medium">Administrador del hogar</p>
            <FormField label="Nombre" error={errors.admin_full_name?.message}>
              <Input autoComplete="off" className="h-10" {...register('admin_full_name')} />
            </FormField>
            <FormField label="Usuario" error={errors.admin_username?.message} hint={USERNAME_HINT}>
              <Input
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="h-10"
                {...register('admin_username')}
              />
            </FormField>
            <FormField
              label="Contraseña inicial"
              error={errors.admin_password?.message}
              hint={`${PASSWORD_HINT} Es provisoria: deberá cambiarla al ingresar por primera vez.`}
            >
              <Input
                type="password"
                autoComplete="new-password"
                className="h-10"
                {...register('admin_password')}
              />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Crear hogar
              </Button>
              <Button asChild variant="outline">
                <Link to="/hogares">Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
