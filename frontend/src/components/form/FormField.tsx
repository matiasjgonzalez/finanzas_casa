import { cloneElement, type ReactElement, useId } from 'react'

import { Label } from '@/components/ui/label'

interface FormFieldProps {
  label: string
  error?: string
  hint?: string
  /** Muestra la marca de obligatorio (*) y lo indica a los lectores de pantalla. */
  required?: boolean
  /** Un único control (Input, etc.). Se le agregan id y atributos de accesibilidad. */
  children: ReactElement<Record<string, unknown>>
}

/**
 * Etiqueta + control + mensaje de ayuda o error.
 * El error queda asociado al campo (aria-describedby) para que los lectores de pantalla lo lean.
 */
export function FormField({ label, error, hint, required, children }: FormFieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error ?? hint

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-1">
        <Label htmlFor={id}>{label}</Label>
        {required && (
          <span className="text-destructive text-sm" aria-hidden="true" title="Obligatorio">
            *
          </span>
        )}
      </div>
      {cloneElement(children, {
        id,
        'aria-required': required || undefined,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': message ? messageId : undefined,
      })}
      {message && (
        <p
          id={messageId}
          className={error ? 'text-destructive text-sm' : 'text-muted-foreground text-xs'}
        >
          {message}
        </p>
      )}
    </div>
  )
}
