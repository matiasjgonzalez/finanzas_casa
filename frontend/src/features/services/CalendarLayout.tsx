import { Link, Outlet, useLocation } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'

// Vencimientos: lo que hay que pagar (programado en Categorías). Pagos realizados: lo cargado.
const SECTIONS = [
  { to: '/calendario', label: 'Vencimientos' },
  { to: '/calendario/pagos', label: 'Pagos realizados' },
  { to: '/calendario/servicios', label: 'Programados' },
]

export function CalendarLayout() {
  const { pathname } = useLocation()
  const current = SECTIONS.slice(1).find((s) => pathname.startsWith(s.to))?.to ?? SECTIONS[0].to
  return (
    <>
      <PageHeader title="Calendario" description="Vencimientos de servicios, tarjetas y otras obligaciones, y los pagos realizados." />
      <nav
        aria-label="Secciones del calendario"
        className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none]"
      >
        {SECTIONS.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            aria-current={current === to ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              current === to
                ? 'border-brand text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
