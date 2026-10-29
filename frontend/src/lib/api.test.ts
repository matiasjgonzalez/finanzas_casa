import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiRequest, setUnauthorizedHandler } from '@/lib/api'
import { jsonResponse } from '@/test/utils'

function lastHeaders(fetchMock: ReturnType<typeof vi.spyOn>): Headers {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit
  return new Headers(init.headers)
}

describe('apiRequest', () => {
  afterEach(() => {
    document.cookie = 'ff_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('envía el token CSRF de la cookie en las operaciones que modifican datos', async () => {
    document.cookie = 'ff_csrf=token-123'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}))

    await apiRequest('/users', { method: 'POST', json: { a: 1 } })

    expect(lastHeaders(fetchMock).get('X-CSRF-Token')).toBe('token-123')
    expect(lastHeaders(fetchMock).get('Content-Type')).toBe('application/json')
  })

  it('no envía el token CSRF en las consultas', async () => {
    document.cookie = 'ff_csrf=token-123'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]))

    await apiRequest('/users')

    expect(lastHeaders(fetchMock).has('X-CSRF-Token')).toBe(false)
  })

  it('devuelve undefined en respuestas sin contenido (204)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))

    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('usa el mensaje del backend y avisa cuando la sesión venció (401)', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ detail: 'Tu sesión expiró. Iniciá sesión nuevamente.' }, 401),
    )

    const error = await apiRequest('/auth/me').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('Tu sesión expiró. Iniciá sesión nuevamente.')
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('traduce los errores de validación a un mensaje comprensible', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ detail: [{ loc: ['body', 'username'], msg: 'String should match pattern' }] }, 422),
    )

    await expect(apiRequest('/users', { method: 'POST', json: {} })).rejects.toThrow(
      'Revisá los datos ingresados.',
    )
  })
})
