import { type ClipboardEvent, type DragEvent, useCallback, useRef, useState } from 'react'

import { ImageAttachmentError, MAX_IMAGES, readImageFile } from './image-attachments'
import type { MessageAttachment } from './workspace-types'

// Estado de las imágenes de un mensaje por enviar, compartido por los dos
// compositores (solicitud nueva y continuación): selector, pegar y arrastrar.
export function useImageAttachments() {
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Cuenta síncrona: dos pegados seguidos no deben pasarse del tope mientras
  // el primero todavía se está leyendo.
  const countRef = useRef(0)

  const addFiles = useCallback(async (list: Iterable<File>) => {
    const files = Array.from(list)
    if (files.length === 0) return
    setError(null)

    const room = Math.max(0, MAX_IMAGES - countRef.current)
    const accepted = files.slice(0, room)
    countRef.current += accepted.length
    const problems: string[] = []
    if (files.length > accepted.length) {
      problems.push(`Solo se pueden adjuntar ${MAX_IMAGES} imágenes por mensaje.`)
    }

    const read: MessageAttachment[] = []
    for (const file of accepted) {
      try {
        read.push(await readImageFile(file))
      } catch (exc) {
        countRef.current -= 1
        problems.push(exc instanceof ImageAttachmentError ? exc.message : 'No se pudo leer la imagen.')
      }
    }

    if (read.length) setAttachments((current) => [...current, ...read])
    if (problems.length) setError(problems.join(' '))
  }, [])

  const remove = useCallback((index: number) => {
    countRef.current = Math.max(0, countRef.current - 1)
    setAttachments((current) => current.filter((_, position) => position !== index))
    setError(null)
  }, [])

  const clear = useCallback(() => {
    countRef.current = 0
    setAttachments([])
    setError(null)
  }, [])

  // Solo se intercepta el pegado si trae imágenes: el texto se pega como siempre.
  const onPaste = useCallback(
    (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
      if (files.length === 0) return
      event.preventDefault()
      void addFiles(files)
    },
    [addFiles],
  )

  const dropHandlers = {
    onDragOver(event: DragEvent) {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return
      event.preventDefault()
      setIsDragging(true)
    },
    onDragLeave(event: DragEvent) {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
      setIsDragging(false)
    },
    onDrop(event: DragEvent) {
      const files = Array.from(event.dataTransfer?.files ?? [])
      setIsDragging(false)
      if (files.length === 0) return
      event.preventDefault()
      void addFiles(files)
    },
  }

  return { attachments, error, isDragging, addFiles, remove, clear, onPaste, dropHandlers }
}
