import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

interface SectionCardProps {
  icon: LucideIcon
  title: string
  description?: ReactNode
  /** Acción en el encabezado (ej. un botón o un enlace). */
  action?: ReactNode
  /** Enlace centrado al pie (ej. "Ver todos los pagos"). */
  footer?: { to: string; label: string; icon?: LucideIcon }
  /** Sin relleno interno: para listas que llegan de borde a borde. */
  flush?: boolean
  className?: string
  children: ReactNode
}

/**
 * Tarjeta de sección: encabezado con ícono y título separado por una línea, contenido y,
 * opcionalmente, un enlace al pie. Es el bloque con el que se arman las pantallas.
 */
export function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  footer,
  flush = false,
  className,
  children,
}: SectionCardProps) {
  const FooterIcon = footer?.icon
  return (
    <section className={cn('bg-card text-card-foreground flex flex-col rounded-3xl border', className)}>
      <header className="flex items-center gap-3 border-b px-5 py-4 sm:px-6 sm:py-5">
        <Icon className="text-brand size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
          {description && <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">{description}</p>}
        </div>
        {action}
      </header>
      <div className={cn('flex-1', !flush && 'p-5 sm:p-6')}>{children}</div>
      {footer && (
        <footer className="border-t">
          <Link
            to={footer.to}
            className="text-brand hover:bg-accent focus-visible:ring-ring/50 flex items-center justify-center gap-2 rounded-b-3xl px-4 py-4 text-sm font-semibold tracking-wide outline-none focus-visible:ring-3"
          >
            {FooterIcon && <FooterIcon className="size-4" aria-hidden="true" />}
            {footer.label}
          </Link>
        </footer>
      )}
    </section>
  )
}
