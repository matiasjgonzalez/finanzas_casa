import { Check } from 'lucide-react'
import { useId } from 'react'

import { cn } from '@/lib/utils'

export interface Choice {
  value: string
  label: string
}

interface ChoiceTilesProps {
  label: string
  options: Choice[]
  value: string
  onChange: (value: string) => void
  required?: boolean
  error?: string
  /** Texto si no hay opciones para elegir. */
  empty?: string
}

/**
 * Elegir una opción tocando un botón grande, en lugar de abrir una lista desplegable. Es más
 * fácil de ver y de usar (sobre todo en el celular y para personas mayores). Para los lectores
 * de pantalla funciona como un grupo de opciones (radio).
 */
export function ChoiceTiles({ label, options, value, onChange, required, error, empty }: ChoiceTilesProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-1">
        <span id={`${id}-label`} className="text-sm font-medium">
          {label}
        </span>
        {required && (
          <span className="text-destructive text-sm" aria-hidden="true" title="Obligatorio">
            *
          </span>
        )}
      </div>
      {options.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <div
          role="radiogroup"
          aria-labelledby={`${id}-label`}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {options.map((option) => {
            const checked = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onChange(option.value)}
                className={cn(
                  'focus-visible:ring-ring/50 flex min-h-14 items-center justify-between gap-2 rounded-2xl border-2 px-4 py-3 text-left text-base font-medium transition-colors outline-none focus-visible:ring-3',
                  checked ? 'border-brand bg-brand/10' : 'border-border hover:border-brand/60 hover:bg-accent',
                  error && !value && 'border-destructive/60',
                )}
              >
                <span className="min-w-0 break-words">{option.label}</span>
                {checked && <Check className="text-brand size-5 shrink-0" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
