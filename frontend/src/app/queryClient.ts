import { QueryClient } from '@tanstack/react-query'

import { ME_QUERY_KEY } from '@/features/auth/useAuth'
import { ApiError, setUnauthorizedHandler } from '@/lib/api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Reintentar solo errores de red o del servidor; un 401/403/404 no se arregla reintentando.
      retry: (failureCount, error) =>
        failureCount < 2 && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
    },
  },
})

// Si cualquier petición responde 401 (sesión vencida, cerrada o cuenta desactivada),
// se marca "sin sesión" y RequireAuth lleva a la pantalla de inicio de sesión.
setUnauthorizedHandler(() => queryClient.setQueryData(ME_QUERY_KEY, null))
