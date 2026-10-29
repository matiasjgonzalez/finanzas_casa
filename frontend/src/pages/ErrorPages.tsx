import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

import { Button } from '@/components/ui/button'

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground max-w-md text-sm">{message}</p>
      <Button asChild variant="outline">
        <Link to="/">Volver al inicio</Link>
      </Button>
    </div>
  )
}

export function NotFoundPage() {
  return <ErrorScreen title="Página no encontrada" message="La dirección no existe o fue movida." />
}

export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  return (
    <ErrorScreen
      title="Algo salió mal"
      message="Ocurrió un error inesperado al mostrar esta pantalla. Recargá la página para intentar de nuevo."
    />
  )
}
