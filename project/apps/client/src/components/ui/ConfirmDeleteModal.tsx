import { useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'

import styles from './ConfirmDeleteModal.module.css'

export interface ConfirmDeleteModalProps {
  isOpen: boolean
  title: string
  description: string
  ariaLabel?: string
  confirmLabel?: string
  cancelLabel?: string
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmDeleteModal({
  isOpen,
  title,
  description,
  ariaLabel,
  confirmLabel = 'Confirmar eliminación',
  cancelLabel = 'Cancelar',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    previousFocusRef.current = document.activeElement as HTMLElement
    cancelBtnRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }

      if (e.key === 'Tab') {
        const cancelBtn = cancelBtnRef.current
        const confirmBtn = confirmBtnRef.current
        if (!cancelBtn || !confirmBtn) return

        if (e.shiftKey) {
          if (document.activeElement === cancelBtn) {
            e.preventDefault()
            confirmBtn.focus()
          }
        } else {
          if (document.activeElement === confirmBtn) {
            e.preventDefault()
            cancelBtn.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div
      aria-label={ariaLabel ?? title}
      aria-modal="true"
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      role="dialog"
    >
      <div className={styles.modal}>
        <div className={styles.iconWrapper}>
          <Trash2 size={22} />
        </div>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.description}>{description}</p>
        <div className={styles.actions}>
          <button
            className={styles.cancelBtn}
            disabled={isLoading}
            onClick={onCancel}
            ref={cancelBtnRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={styles.confirmBtn}
            disabled={isLoading}
            onClick={() => void onConfirm()}
            ref={confirmBtnRef}
            type="button"
          >
            <Trash2 size={15} />
            <span>{isLoading ? 'Eliminando…' : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
