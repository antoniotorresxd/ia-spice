import type { AttachmentMediaType, MessageAttachment } from './workspace-types'

// Los mismos topes que valida el server (workspace.schemas.ts): se adelantan
// aquí para avisar antes de enviar, no para reemplazar esa validación.
export const ACCEPTED_IMAGE_TYPES: readonly AttachmentMediaType[] = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_IMAGES = 3
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
// Lado más largo al reducir una foto: de sobra para leer valores de una figura.
export const MAX_IMAGE_SIDE = 1600

export class ImageAttachmentError extends Error {}

// Reduce una imagen pesada; null si el navegador no puede (o no hay canvas,
// como en jsdom). Se inyecta para probar el camino sin canvas real.
export type Downscale = (file: File) => Promise<Blob | null>

function isAccepted(type: string): type is AttachmentMediaType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type)
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(blob)
  })
}

async function toAttachment(blob: Blob, mediaType: AttachmentMediaType): Promise<MessageAttachment> {
  const dataUrl = await readAsDataUrl(blob)
  return { mediaType, data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}

export const downscaleWithCanvas: Downscale = async (file) => {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return null
    // JPEG no tiene transparencia: un PNG con fondo transparente quedaría negro.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  } catch {
    return null
  }
}

// Lee un archivo elegido, pegado o arrastrado como adjunto. Una imagen de más
// de 2 MB se reduce a JPEG antes de rendirse.
export async function readImageFile(file: File, downscale: Downscale = downscaleWithCanvas): Promise<MessageAttachment> {
  const name = file.name || 'La imagen'
  if (!isAccepted(file.type)) {
    throw new ImageAttachmentError(`"${name}" no es una imagen PNG, JPEG o WebP.`)
  }
  if (file.size <= MAX_IMAGE_BYTES) return toAttachment(file, file.type)

  const reduced = await downscale(file)
  if (reduced && reduced.size <= MAX_IMAGE_BYTES && isAccepted(reduced.type)) {
    return toAttachment(reduced, reduced.type)
  }
  throw new ImageAttachmentError(`"${name}" pesa más de 2 MB y no se pudo reducir.`)
}

export function attachmentSrc(attachment: MessageAttachment): string {
  return `data:${attachment.mediaType};base64,${attachment.data}`
}
