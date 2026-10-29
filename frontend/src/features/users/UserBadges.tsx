import { CircleCheck, CircleSlash, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { User } from '@/features/auth/types'
import { ROLE_LABELS } from '@/features/users/schemas'

export function RoleBadge({ role }: { role: User['role'] }) {
  return role !== 'member' ? (
    <Badge variant="outline" className="border-brand/50">
      <ShieldCheck aria-hidden="true" />
      {ROLE_LABELS[role]}
    </Badge>
  ) : (
    <Badge variant="outline">{ROLE_LABELS.member}</Badge>
  )
}

export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="text-positive inline-flex items-center gap-1 text-sm">
      <CircleCheck className="size-3.5" aria-hidden="true" /> Activo
    </span>
  ) : (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
      <CircleSlash className="size-3.5" aria-hidden="true" /> Inactivo
    </span>
  )
}
