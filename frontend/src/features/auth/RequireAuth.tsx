import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { useMe } from '@/features/auth/useAuth'

// Se define acá (y no en ForcePasswordChangePage) para no crear un import circular.
export const FORCE_PASSWORD_CHANGE_PATH = '/cambiar-contrasena'

export function FullScreenLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center" role="status">
      <LoaderCircle className="text-brand size-8 animate-spin" aria-hidden="true" />
      <span className="sr-only">Cargando…</span>
    </div>
  )
}

/** Muestra las rutas hijas solo con sesión iniciada; si no, lleva al inicio de sesión. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { data: me, isPending, error, refetch } = useMe()
  const location = useLocation()

  if (isPending) return <FullScreenLoader />
  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">{error.message}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    )
  }
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  // Contraseña provisoria: solo se puede ir a la pantalla para cambiarla (el backend bloquea el resto).
  if (me.user.must_change_password && location.pathname !== FORCE_PASSWORD_CHANGE_PATH) {
    return <Navigate to={FORCE_PASSWORD_CHANGE_PATH} replace />
  }
  return children ?? <Outlet />
}

/**
 * Oculta la sección a quien no es administrador.
 * Es solo comodidad visual: el backend rechaza igual cualquier acción no autorizada.
 */
export function RequireAdmin({ children }: { children?: ReactNode }) {
  const { data: me } = useMe()
  if (me?.user.role !== 'admin') {
    return (
      <div className="py-16 text-center">
        <h1 className="text-xl font-semibold">Acceso restringido</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Esta sección es solo para administradores del hogar.
        </p>
      </div>
    )
  }
  return children ?? <Outlet />
}

/** Secciones con datos de un hogar: el superadmin no pertenece a ninguno, va a Hogares. */
export function RequireHousehold() {
  const { data: me } = useMe()
  if (me?.user.role === 'superadmin') return <Navigate to="/hogares" replace />
  return <Outlet />
}

/** Administración de hogares: solo el superadmin (el backend también lo exige). */
export function RequireSuperadmin() {
  const { data: me } = useMe()
  if (me?.user.role !== 'superadmin') return <Navigate to="/" replace />
  return <Outlet />
}
