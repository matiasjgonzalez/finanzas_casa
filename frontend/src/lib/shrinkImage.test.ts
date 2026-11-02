import { afterEach, describe, expect, it, vi } from 'vitest'

import { shrinkImage } from '@/lib/shrinkImage'

const big = (name: string, type: string) => new File([new Uint8Array(2_000_000)], name, { type })

function fakeBrowser(outputBytes: number) {
  const bitmap = { width: 4000, height: 3000, close: vi.fn() }
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (done: (b: Blob) => void, type: string) => done(new Blob([new Uint8Array(outputBytes)], { type })),
  }
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'canvas' ? (canvas as unknown as HTMLCanvasElement) : create(tag),
  )
  return { canvas, context }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('shrinkImage', () => {
  it('achica una foto grande a JPEG de 1600 px como máximo', async () => {
    const { canvas, context } = fakeBrowser(250_000)

    const result = await shrinkImage(big('ticket.png', 'image/png'))

    expect(result.name).toBe('ticket.jpg')
    expect(result.type).toBe('image/jpeg')
    expect(result.size).toBe(250_000)
    expect([canvas.width, canvas.height]).toEqual([1600, 1200])
    expect(context.fillRect).toHaveBeenCalled() // fondo blanco para lo transparente
  })

  it('deja igual los PDF, las fotos chicas y lo que no se puede achicar', async () => {
    fakeBrowser(3_000_000) // "achicada" quedaría más grande

    const pdf = big('factura.pdf', 'application/pdf')
    const small = new File([new Uint8Array(1000)], 'chica.jpg', { type: 'image/jpeg' })
    const photo = big('foto.jpg', 'image/jpeg')

    expect(await shrinkImage(pdf)).toBe(pdf)
    expect(await shrinkImage(small)).toBe(small)
    expect(await shrinkImage(photo)).toBe(photo)
  })

  it('si el navegador falla, sube la original', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('formato raro')))
    const photo = big('foto.webp', 'image/webp')

    expect(await shrinkImage(photo)).toBe(photo)
  })
})
