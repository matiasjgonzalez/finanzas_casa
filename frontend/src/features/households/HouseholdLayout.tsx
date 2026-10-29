import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, Outlet, useMatch, useParams } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/form/FormField'
import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { HouseholdSummary } from '@/features/households/api'
import { useHousehold, useUpdateHousehold } from '@/features/households/useHouseholds'
import { householdScope, UsersScopeContext } from '@/features/users/scope'
import { ApiError } from '@/lib/api'

const nameSchema = z.object({
  name: z.string().trim().min(1, 'Ingresá el nombre del hogar.').max(120, 'Máximo 120 caracteres.'),
})

function HouseholdSettings({ household }: { household: HouseholdSummary }) {
  const update = useUpdateHousehold(household.id)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    values: { name: household.name },
  })

  const rename = handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: () => toast.success('Nombre actualizado.'),
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) setError('name', { message: error.message })
        else toast.error(error.message)
      },
    }),
  )

  const toggle = (active: boolean) =>
    update.mutate(
      { is_active: active },
      {
        onSuccess: () =>
          toast.success(
            active ? 'El hogar fue activado.' : 'El hogar fue desactivado y se cerraron sus sesiones.',
          ),
        onError: (error) => toast.error(error.message),
      },
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hogar</CardTitle>
        <CardDescription>
          Un hogar desactivado no puede ingresar a la aplicación; sus datos se conservan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <form onSubmit={rename} noValidate className="flex flex-1 items-end gap-2">
          <div className="flex-1">
            <FormField label="Nombre" error={errors.name?.message}>
              <Input className="h-10" {...register('name')} />
            </FormField>
          </div>
          <Button type="submit" variant="outline" className="h-10" disabled={!isDirty || update.isPending}>
            {update.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Guardar
          </Button>
        </form>
        <div className="flex h-10 items-center gap-3">
          <Switch
            id="hogar-activo"
            checked={household.is_active}
            onCheckedChange={toggle}
            disabled={update.isPending}
          />
          <Label htmlFor="hogar-activo">Hogar activo</Label>
        </div>
      </CardContent>
    </Card>
  )
}

/** Detalle de un hogar para el superadmin: sus datos y la gestión de sus usuarios. */
export function HouseholdLayout() {
  const { householdId = '' } = useParams()
  const { data: household, error, isPending, refetch } = useHousehold(householdId)
  // Los datos del hogar se editan en su pantalla principal, no al crear o editar un usuario.
  const onMainPage = useMatch('/hogares/:householdId') !== null

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/hogares">
          <ArrowLeft aria-hidden="true" /> Todos los hogares
        </Link>
      </Button>
      {isPending ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <PageHeader
            title={household.name}
            description={
              household.admins_count === 0
                ? 'Este hogar no tiene administrador: editá a un integrante y asignale el rol Administrador.'
                : 'Sus pagos, categorías y servicios solo los ven sus integrantes.'
            }
          />
          {onMainPage && <HouseholdSettings household={household} />}
          <UsersScopeContext value={householdScope(household.id)}>
            <Outlet />
          </UsersScopeContext>
        </>
      )}
    </div>
  )
}
