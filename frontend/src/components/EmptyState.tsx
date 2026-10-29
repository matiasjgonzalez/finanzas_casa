import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Estado vacío: ícono en un círculo, mensaje y, si corresponde, qué hacer a continuación. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: { to: string; label: string; icon?: LucideIcon }
}) {
  const ActionIcon = action?.icon
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span className="bg-muted text-muted-foreground mb-1 flex size-12 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="font-medium">{title}</p>
      {description && <p className="text-muted-foreground max-w-sm text-sm">{description}</p>}
      {action && (
        <Link
          to={action.to}
          className="text-brand mt-2 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold tracking-wide hover:underline"
        >
          {ActionIcon && <ActionIcon className="size-4" aria-hidden="true" />}
          {action.label}
        </Link>
      )}
    </div>
  )
}
