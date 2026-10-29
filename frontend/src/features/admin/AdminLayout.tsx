import { Link, Outlet, useLocation } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'

const BASE = '/administracion'

// "Usuarios" es la sección por defecto: abarca /administracion y sus subpáginas (nuevo/editar).
const SECTIONS = [
  { to: BASE, label: 'Usuarios' },
  { to: `${BASE}/historial`, label: 'Historial' },
]

export function AdminLayout() {
  const { pathname } = useLocation()
  const current =
    SECTIONS.slice(1).find((s) => pathname.startsWith(s.to))?.to ?? BASE

  return (
    <>
      <PageHeader
        title="Administración"
        description="Usuarios e historial de acciones del hogar."
      />
      <nav
        aria-label="Secciones de administración"
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
