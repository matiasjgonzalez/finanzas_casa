import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { FormField } from '@/components/form/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { changePassword } from '@/features/auth/api'
import type { Me } from '@/features/auth/types'
import { ME_QUERY_KEY } from '@/features/auth/useAuth'
import { passwordSchema } from '@/features/users/schemas'

const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Ingresá tu contraseña actual.'),
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Las contraseñas no coinciden.',
  })
type ChangePasswordValues = z.infer<typeof changePasswordSchema>

interface ChangePasswordFormProps {
  onSuccess: () => void
  submitLabel?: string
}

export function ChangePasswordForm({ onSuccess, submitLabel = 'Cambiar contraseña' }: ChangePasswordFormProps) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (v: ChangePasswordValues) => changePassword(v.current_password, v.new_password),
    onSuccess: () => {
      // El backend ya no exige el cambio: se actualiza la sesión guardada sin esperar otra consulta.
      queryClient.setQueryData<Me | null>(ME_QUERY_KEY, (me) =>
        me ? { ...me, user: { ...me.user, must_change_password: false } } : me,
      )
    },
  })
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  const onSubmit = handleSubmit((values) =>
    mutation.mutate(values, {
      onSuccess: () => {
        reset()
        onSuccess()
      },
      onError: (error) => {
        if (error.message.includes('contraseña actual')) {
          setError('current_password', { message: error.message })
        } else if (error.message.includes('distinta de la actual')) {
          setError('new_password', { message: error.message })
        }
      },
    }),
  )

  const generalError =
    mutation.error && !errors.current_password && !errors.new_password ? mutation.error : null

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {generalError && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{generalError.message}</AlertDescription>
        </Alert>
      )}
      <FormField label="Contraseña actual" error={errors.current_password?.message}>
        <Input type="password" autoComplete="current-password" className="h-10" {...register('current_password')} />
      </FormField>
      <FormField label="Nueva contraseña" error={errors.new_password?.message}>
        <Input type="password" autoComplete="new-password" className="h-10" {...register('new_password')} />
      </FormField>
      <FormField label="Repetí la nueva contraseña" error={errors.confirm_password?.message}>
        <Input type="password" autoComplete="new-password" className="h-10" {...register('confirm_password')} />
      </FormField>
      <Button type="submit" className="self-start" disabled={mutation.isPending}>
        {mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  )
}
