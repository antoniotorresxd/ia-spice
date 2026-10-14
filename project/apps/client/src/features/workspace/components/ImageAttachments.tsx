import { ImagePlus, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { ACCEPTED_IMAGE_TYPES, attachmentSrc, MAX_IMAGES } from '../model/image-attachments'
import type { MessageAttachment } from '../model/workspace-types'
import styles from './ImageAttachments.module.css'

type AttachImageButtonProps = {
  disabled?: boolean
  full?: boolean
  onFiles(files: File[]): void
  className?: string
  children?: ReactNode
}

// Un <label> que envuelve el input de archivo: se ve como botón, el input
// sigue siendo el control accesible (y el que se enfoca con el teclado).
export function AttachImageButton({ disabled, full, onFiles, className, children }: AttachImageButtonProps) {
  return (
    <label
      className={`${styles.attachButton} ${className ?? ''}`}
      data-disabled={disabled || full ? 'true' : undefined}
      title={full ? `Máximo ${MAX_IMAGES} imágenes por mensaje` : 'Adjuntar imagen (también puedes pegarla o arrastrarla)'}
    >
      <input
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        aria-label="Adjuntar imagen"
        className={styles.fileInput}
        disabled={disabled || full}
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          // Se limpia para que volver a elegir el mismo archivo dispare onChange.
          event.target.value = ''
          if (files.length) onFiles(files)
        }}
        type="file"
      />
      <ImagePlus aria-hidden="true" size={15} />
      {children}
    </label>
  )
}

type AttachmentPreviewsProps = {
  attachments: MessageAttachment[]
  disabled?: boolean
  className?: string
  onRemove(index: number): void
}

// Miniaturas de lo que se va a enviar, cada una con su botón para quitarla.
export function AttachmentPreviews({ attachments, disabled, className, onRemove }: AttachmentPreviewsProps) {
  if (attachments.length === 0) return null
  return (
    <ul aria-label="Imágenes por enviar" className={`${styles.previews} ${className ?? ''}`}>
      {attachments.map((attachment, index) => (
        <li className={styles.preview} key={`${index}-${attachment.data.slice(0, 24)}`}>
          <img alt={`Imagen adjunta ${index + 1}`} src={attachmentSrc(attachment)} />
          <button
            aria-label={`Quitar imagen ${index + 1}`}
            className={styles.removeButton}
            disabled={disabled}
            onClick={() => onRemove(index)}
            title="Quitar imagen"
            type="button"
          >
            <X aria-hidden="true" size={12} />
          </button>
        </li>
      ))}
    </ul>
  )
}

// Las imágenes de un mensaje ya enviado: miniaturas que abren la imagen completa.
export function MessageImages({ attachments }: { attachments: MessageAttachment[] | undefined }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!attachments?.length) return null
  return (
    <>
      <div className={styles.messageImages}>
        {attachments.map((attachment, index) => (
          <button
            aria-label={`Ver imagen ${index + 1} en tamaño completo`}
            className={styles.messageThumb}
            key={`${index}-${attachment.data.slice(0, 24)}`}
            onClick={() => setOpen(index)}
            type="button"
          >
            <img alt="" src={attachmentSrc(attachment)} />
          </button>
        ))}
      </div>
      {open !== null && attachments[open] ? (
        <ImageLightbox attachment={attachments[open]} onClose={() => setOpen(null)} />
      ) : null}
    </>
  )
}

function ImageLightbox({ attachment, onClose }: { attachment: MessageAttachment; onClose(): void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // En un portal: el historial tiene backdrop-filter, que volvería relativo a
  // él un overlay `position: fixed` anidado.
  return createPortal(
    <div
      aria-label="Imagen adjunta"
      aria-modal="true"
      className={styles.lightbox}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <img alt="Imagen adjunta en tamaño completo" src={attachmentSrc(attachment)} />
      <button
        aria-label="Cerrar imagen"
        className={styles.lightboxClose}
        onClick={onClose}
        ref={closeRef}
        type="button"
      >
        <X aria-hidden="true" size={18} />
      </button>
    </div>,
    document.body,
  )
}
