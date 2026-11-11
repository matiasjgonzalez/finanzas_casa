import { useSearchParams } from 'react-router'

import { useCurrentUser } from '@/features/auth/useAuth'

/** "mine": los gastos que cargó quien mira. "household": los de todo el hogar (solo el admin). */
export type Scope = 'mine' | 'household'

/** En la URL: ?vista=hogar. Sin el parámetro (o si no es admin), "Mis gastos". */
export const SCOPE_PARAM = 'vista'
const HOUSEHOLD_VALUE = 'hogar'

export function useScope(): Scope {
  const [params] = useSearchParams()
  const { isAdmin } = useCurrentUser()
  return isAdmin && params.get(SCOPE_PARAM) === HOUSEHOLD_VALUE ? 'household' : 'mine'
}

/** Valor del parámetro de la URL para un scope ('' = el de por defecto). */
export const scopeParam = (scope: Scope) => (scope === 'household' ? HOUSEHOLD_VALUE : '')
