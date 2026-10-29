import { LogOut, Menu, Moon, Plus, Sun, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useNavigation } from 'react-router'

import { visibleNavItems } from '@/app/navigation'
import { preloadSections } from '@/app/pages'
import { NavItems } from '@/components/layout/NavItems'
import { navItemClass } from '@/components/layout/navStyles'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useCurrentUser, useLogout } from '@/features/auth/useAuth'
import { useAlerts } from '@/features/services/useServices'
import { useTheme } from '@/features/theme/useTheme'

function Brand({ subtitle }: { subtitle?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-brand flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
        <Wallet className="size-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[15px] font-semibold">Finanzas</span>
        <span className="text-[15px] font-semibold">Familiares</span>
        {subtitle && <span className="text-nav-foreground/70 mt-0.5 truncate text-xs">{subtitle}</span>}
      </span>
    </div>
  )
}

/** "Tema claro" / "Tema oscuro" y "Cerrar sesión", al pie del menú (como ítems más). */
function MenuFooter({ onNavigate }: { onNavigate?: () => void }) {
  const { preference, setPreference } = useTheme()
  const logout = useLogout()
  const navigate = useNavigate()
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div className="flex flex-col gap-1">
      <button type="button" className={navItemClass(false)} onClick={() => setPreference(dark ? 'light' : 'dark')}>
        {dark ? <Sun className="size-[18px]" aria-hidden="true" /> : <Moon className="size-[18px]" aria-hidden="true" />}
        {dark ? 'Tema claro' : 'Tema oscuro'}
      </button>
      <button
        type="button"
        className={navItemClass(false)}
        onClick={() => {
          onNavigate?.()
          logout.mutate(undefined, { onSettled: () => navigate('/login') })
        }}
      >
        <LogOut className="size-[18px]" aria-hidden="true" />
        Cerrar sesión
      </button>
      <p className="text-nav-foreground/50 mt-2 text-center text-[11px]">v{__APP_VERSION__}</p>
    </div>
  )
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, household, isSuperadmin } = useCurrentUser()
  const { pathname } = useLocation()
  const navigation = useNavigation()
  // Recordatorio en el menú: vencidos + por vencer en los próximos 7 días (no aplica al superadmin).
  const { data: alerts } = useAlerts(7, !isSuperadmin)
  const pending = alerts ? alerts.overdue + alerts.due_soon : 0
  const badges = {
    '/calendario': {
      count: pending,
      label: `${pending} ${pending === 1 ? 'vencimiento' : 'vencimientos'} por atender`,
      urgent: (alerts?.overdue ?? 0) > 0,
    },
  }
  const subtitle = isSuperadmin ? 'Administración de hogares' : household?.name

  // Con la página ya mostrada, se descargan en segundo plano las demás secciones del menú.
  useEffect(() => {
    preloadSections(visibleNavItems(user.role).flatMap((item) => item.preload ?? []))
  }, [user.role])

  return (
    <div className="min-h-svh md:flex md:gap-6 md:p-4">
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

      {/* Menú lateral "flotante" (computadora y tablet horizontal) */}
      <aside className="from-nav-from to-nav-to text-nav-foreground sticky top-4 hidden h-[calc(100svh-2rem)] w-64 shrink-0 flex-col gap-8 overflow-y-auto rounded-3xl bg-gradient-to-b p-4 shadow-xl md:flex">
        <div className="px-2 pt-2">
          <Brand subtitle={subtitle} />
        </div>
        <nav aria-label="Navegación principal">
          <NavItems role={user.role} badges={badges} />
        </nav>
        <div className="mt-auto">
          <MenuFooter />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Encabezado del celular: marca y menú desplegable con el mismo estilo */}
        <header className="bg-card sticky top-0 z-40 flex items-center justify-between border-b px-4 py-3 md:hidden">
          <div className="flex items-center gap-2 font-semibold">
            <span className="bg-brand flex size-8 items-center justify-center rounded-lg text-white">
              <Wallet className="size-4" aria-hidden="true" />
            </span>
            Finanzas Familiares
          </div>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menú">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="from-nav-from to-nav-to text-nav-foreground flex w-72 flex-col gap-6 overflow-y-auto border-0 bg-gradient-to-b p-4 [&>button]:text-nav-foreground"
            >
              <SheetHeader className="p-0 pt-2">
                <SheetTitle className="text-nav-foreground">
                  <Brand subtitle={subtitle} />
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Navegación principal">
                <NavItems role={user.role} badges={badges} onNavigate={() => setMenuOpen(false)} />
              </nav>
              <div className="mt-auto">
                <MenuFooter onNavigate={() => setMenuOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main id="contenido" className="mx-auto w-full max-w-7xl p-4 pb-24 md:px-2 md:py-2">
          <TopBar />
          <Outlet />
        </main>
      </div>

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
