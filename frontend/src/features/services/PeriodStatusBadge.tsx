import { CircleCheck, Clock, TriangleAlert } from 'lucide-react'

import { type PeriodStatus, STATUS_LABELS } from '@/features/services/api'
import { cn } from '@/lib/utils'

const STYLES: Record<PeriodStatus, { icon: typeof Clock; className: string }> = {
  pending: { icon: Clock, className: 'text-warning border-warning/40' },
  overdue: { icon: TriangleAlert, className: 'text-destructive border-destructive/40' },
  paid: { icon: CircleCheck, className: 'text-positive border-positive/40' },
}

/** Estado de un vencimiento: ícono + texto (el color nunca es el único indicador). */
export function PeriodStatusBadge({ status, className }: { status: PeriodStatus; className?: string }) {
  const { icon: Icon, className: style } = STYLES[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        style,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  )
}

export function StatusIcon({ status, className }: { status: PeriodStatus; className?: string }) {
  const { icon: Icon, className: style } = STYLES[status]
  return <Icon className={cn('size-3.5 shrink-0', style, className)} aria-label={STATUS_LABELS[status]} />
}
