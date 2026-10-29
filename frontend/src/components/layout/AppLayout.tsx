import { Menu, Plus, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigation } from 'react-router'

import { visibleNavItems } from '@/app/navigation'
import { preloadSections } from '@/app/pages'
import { NavItems } from '@/components/layout/NavItems'
import { UserMenu } from '@/components/layout/UserMenu'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useCurrentUser } from '@/features/auth/useAuth'
import { useAlerts } from '@/features/services/useServices'
import { ThemeMenu } from '@/features/theme/ThemeMenu'

function Brand() {
  return (
    <div className="flex items-center gap-2 font-semibold">
      <span className="bg-brand flex size-8 items-center justify-center rounded-lg text-white">
        <Wallet className="size-4" aria-hidden="true" />
      </span>
      Finanzas Familiares
    </div>
  )
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, isSuperadmin } = useCurrentUser()
  const { pathname } = useLocation()
  const navigation = useNavigation()
  // Recordatorio en el menú: vencidos + por vencer en los próximos 7 días (no aplica al superadmin).
  const { data: alerts } = useAlerts(7, !isSuperadmin)

  // Con la página ya mostrada, se descargan en segundo plano las demás secciones del menú.
  useEffect(() => {
    preloadSections(visibleNavItems(user.role).flatMap((item) => item.preload ?? []))
  }, [user.role])
  const pending = alerts ? alerts.overdue + alerts.due_soon : 0
  const badges = {
    '/calendario': {
      count: pending,
      label: `${pending} ${pending === 1 ? 'vencimiento' : 'vencimientos'} por atender`,
      urgent: (alerts?.overdue ?? 0) > 0,
    },
  }

  return (
    <div className="min-h-svh md:grid md:grid-cols-[15rem_1fr]">
      <a
        href="#contenido"
        className="bg-background sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>

      {/* Mientras se descarga una sección, una barra fina arriba indica que se está cargando. */}
      {navigation.state === 'loading' && (
        <div
          role="progressbar"
          aria-label="Cargando sección"
          className="bg-brand fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse"
        />
      )}

      {/* Barra lateral (computadora y tablet horizontal) */}
      <aside className="bg-card hidden border-r md:flex md:flex-col md:gap-6 md:p-4">
        <Brand />
        {!isSuperadmin && (
          <Button asChild className="h-10">
            <Link to="/pagos/nuevo">
              <Plus aria-hidden="true" /> Nuevo pago
            </Link>
          </Button>
        )}
        <nav aria-label="Navegación principal">
          <NavItems role={user.role} badges={badges} />
        </nav>
        <div className="mt-auto flex items-center gap-1 border-t pt-3">
          <div className="min-w-0 flex-1">
            <UserMenu />
          </div>
          <ThemeMenu />
        </div>
      </aside>

      {/* Encabezado con menú desplegable (celular) */}
      <header className="bg-card sticky top-0 z-40 flex items-center justify-between border-b px-4 py-3 md:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <ThemeMenu />
          <UserMenu compact />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menú">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetHeader className="p-0">
                <SheetTitle>
                  <Brand />
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Navegación principal">
                <NavItems role={user.role} badges={badges} onNavigate={() => setMenuOpen(false)} />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main id="contenido" className="mx-auto w-full max-w-6xl p-4 pb-24 md:p-8">
        <Outlet />
      </main>

      {/* Botón flotante en el celular: registrar un pago siempre queda a un toque. */}
      {!isSuperadmin && pathname !== '/pagos/nuevo' && (
        <Button
          asChild
          size="icon"
          className="fixed right-4 bottom-4 z-30 size-14 rounded-full shadow-lg md:hidden"
        >
          <Link to="/pagos/nuevo" aria-label="Nuevo pago">
            <Plus className="size-6" />
          </Link>
        </Button>
      )}
    </div>
  )
}
