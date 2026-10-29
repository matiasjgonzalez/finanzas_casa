import { CirclePlus, Plus } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/features/auth/useAuth'

/** Barra superior: el saludo y la acción principal, con un botón grande y claro. */
export function TopBar() {
  const { user, isSuperadmin } = useCurrentUser()
  const { pathname } = useLocation()
  const firstName = user.full_name.split(' ')[0]

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4 md:mb-8 md:min-h-[76px]">
      <p className="text-xl sm:text-2xl">
        Hola, <span className="text-brand font-semibold">{firstName}</span>
      </p>
      {isSuperadmin ? (
        <Button asChild size="lg" className="hidden md:inline-flex">
          <Link to="/hogares/nuevo">
            <Plus aria-hidden="true" /> Nuevo hogar
          </Link>
        </Button>
      ) : (
        pathname !== '/pagos/nuevo' && (
          <Button asChild size="lg" className="hidden h-12 px-5 text-base md:inline-flex">
            <Link to="/pagos/nuevo">
              <CirclePlus className="size-5" aria-hidden="true" /> Cargar un pago
            </Link>
          </Button>
        )
      )}
    </div>
  )
}
