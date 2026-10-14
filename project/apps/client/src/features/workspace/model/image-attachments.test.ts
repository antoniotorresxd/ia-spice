import { describe, expect, it, vi } from 'vitest'

import {
  attachmentSrc,
  ImageAttachmentError,
  MAX_IMAGE_BYTES,
  readImageFile,
} from './image-attachments'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('readImageFile', () => {
  it('lee una imagen chica tal cual, en base64 sin el prefijo data:', async () => {
    const file = new File([PNG_BYTES], 'figura.png', { type: 'image/png' })

    expect(await readImageFile(file)).toEqual({ mediaType: 'image/png', data: 'iVBORw0KGgo=' })
  })

  it('rechaza un formato fuera de png/jpeg/webp', async () => {
    const file = new File([PNG_BYTES], 'animada.gif', { type: 'image/gif' })

    await expect(readImageFile(file)).rejects.toThrow(ImageAttachmentError)
    await expect(readImageFile(file)).rejects.toThrow('animada.gif')
  })

  it('reduce una imagen de más de 2 MB antes de adjuntarla', async () => {
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'foto.png', { type: 'image/png' })
    const downscale = vi.fn().mockResolvedValue(new Blob([PNG_BYTES], { type: 'image/jpeg' }))

    const attachment = await readImageFile(big, downscale)

    expect(downscale).toHaveBeenCalledWith(big)
    expect(attachment).toEqual({ mediaType: 'image/jpeg', data: 'iVBORw0KGgo=' })
  })

  it('rechaza una imagen grande que no se pudo reducir por debajo del tope', async () => {
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'foto.png', { type: 'image/png' })

    await expect(readImageFile(big, async () => null)).rejects.toThrow('2 MB')
  })
})

it('attachmentSrc arma la URL data: para mostrar la imagen', () => {
  expect(attachmentSrc({ mediaType: 'image/webp', data: 'UklGRg==' })).toBe('data:image/webp;base64,UklGRg==')
})
