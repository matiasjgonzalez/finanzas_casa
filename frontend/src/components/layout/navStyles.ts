import { cn } from '@/lib/utils'

/** Clases de un ítem del menú lateral (sobre el degradé): la sección actual es una "píldora". */
export const navItemClass = (active: boolean) =>
  cn(
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
    'outline-none focus-visible:ring-3 focus-visible:ring-white/40',
    active
      ? 'bg-white/15 text-nav-foreground shadow-sm'
      : 'text-nav-foreground/80 hover:bg-white/10 hover:text-nav-foreground',
  )
