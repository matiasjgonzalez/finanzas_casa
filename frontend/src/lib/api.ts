/**
 * Cliente HTTP único para hablar con la API.
 *
 * - Todas las rutas van a /api (en desarrollo, Vite las redirige al backend).
 * - credentials 'same-origin': el navegador envía la cookie de sesión automáticamente.
 * - En las operaciones que modifican datos se envía el token CSRF (encabezado X-CSRF-Token),
 *   que el backend dejó en la cookie ff_csrf al iniciar sesión.
 * - Los errores se convierten en ApiError con un mensaje comprensible para mostrar al usuario.
 */

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const NETWORK_ERROR_MESSAGE = 'No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const CSRF_COOKIE = 'ff_csrf'

/** Se ejecuta cuando la API responde 401 (sesión vencida o cerrada). Lo configura la app. */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

function messageForStatus(status: number): string {
  if (status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.'
  if (status === 403) return 'No tenés permiso para realizar esta acción.'
  if (status === 404) return 'No encontramos lo que buscabas.'
  if (status === 422) return 'Revisá los datos ingresados.'
  if (status >= 500) return 'El servidor tuvo un problema. Intentá nuevamente en unos minutos.'
  return 'No se pudo completar la operación.'
}

function extractDetail(body: unknown): string | null {
  // Los errores de negocio traen {"detail": "mensaje"}; los de validación, una lista (se ignora).
  if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
    return body.detail
  }
  return null
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Objeto que se envía como JSON. */
  json?: unknown
  /** Formulario con archivos (el navegador arma el Content-Type con su separador). */
  form?: FormData
}

export async function apiRequest<T>(
  path: string,
  { json, form, ...init }: RequestOptions = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (json !== undefined) headers.set('Content-Type', 'application/json')
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      method,
      headers,
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
    })
  } catch {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE)
  }

  if (response.status === 204) return undefined as T

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.()
    throw new ApiError(response.status, extractDetail(body) ?? messageForStatus(response.status), body)
  }
  return body as T
}
