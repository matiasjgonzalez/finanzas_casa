import { z } from 'zod'

// Mismas reglas que el backend (app/schemas/user.py). El backend vuelve a validar siempre:
// esto solo sirve para avisar antes de enviar el formulario.
export const PASSWORD_MIN_LENGTH = 6
export const PASSWORD_MAX_LENGTH = 128

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Usá al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, `Usá como máximo ${PASSWORD_MAX_LENGTH} caracteres.`)

export const PASSWORD_HINT = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Una frase fácil de recordar es más segura que una palabra corta.`

export const USERNAME_HINT =
  'Con este nombre inicia sesión. Letras sin acentos, números, punto, guion o guion bajo; sin espacios.'

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Usá al menos 3 caracteres.')
  .max(40, 'Usá como máximo 40 caracteres.')
  .regex(/^[a-z0-9._-]+$/, 'Solo letras sin acentos, números, punto, guion o guion bajo (sin espacios).')

const userFields = {
  full_name: z.string().trim().min(1, 'Ingresá el nombre.').max(120, 'Máximo 120 caracteres.'),
  username: usernameSchema,
  role: z.enum(['admin', 'member']),
}

export const userCreateSchema = z.object({ ...userFields, password: passwordSchema })
export type UserCreateValues = z.infer<typeof userCreateSchema>

export const userEditSchema = z.object(userFields)
export type UserEditValues = z.infer<typeof userEditSchema>

export const ROLE_LABELS = {
  superadmin: 'Superadmin',
  admin: 'Administrador',
  member: 'Integrante',
} as const
