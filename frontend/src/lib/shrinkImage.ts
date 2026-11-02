/** Lado mayor de la foto achicada: se sigue leyendo bien un ticket o una factura. */
const MAX_SIDE = 1600
const QUALITY = 0.8
/** Las fotos chicas se suben tal cual. */
const MIN_BYTES = 300 * 1024
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * Achica una foto antes de subirla (una del celular pasa de varios MB a unos 300 KB): los
 * comprobantes se guardan en la base y el espacio gratis es limitado. Los PDF y las fotos
 * chicas quedan igual; si el navegador no puede achicarla, se sube la original.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!PHOTO_TYPES.has(file.type) || file.size < MIN_BYTES || typeof createImageBitmap !== 'function') {
    return file
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return file
    // Fondo blanco: en JPEG lo transparente de un PNG quedaría negro.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}
