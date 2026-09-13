import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import type { WorkspaceConversationDetail } from '../model/workspace-types'
import styles from './ProjectsScreen.module.css'

type RenameConversationDialogProps = {
  initialTitle: string
  renameConversation(title: string): Promise<WorkspaceConversationDetail>
  onClose(): void
  onRenamed(conversation: WorkspaceConversationDetail): void
}

export function RenameConversationDialog({
  initialTitle,
  renameConversation,
  onClose,
  onRenamed,
}: RenameConversationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState(initialTitle)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const input = dialogRef.current?.querySelector<HTMLInputElement>('#rename-conversation-title')
    input?.focus()
    input?.select()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !submitting) {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input, textarea, button:not(:disabled)') ?? [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Escribe un título para la conversación.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const updated = await renameConversation(trimmedTitle)
      onRenamed(updated)
    } catch {
      setError('No pudimos renombrar la conversación. Inténtalo de nuevo.')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.backdrop}>
      <div
        aria-labelledby="rename-conversation-title-heading"
        aria-modal="true"
        className={styles.dialog}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <p>Workspace</p>
          <h2 id="rename-conversation-title-heading">Renombrar conversación</h2>
        </header>
        <form onSubmit={handleSubmit}>
          <label htmlFor="rename-conversation-title">Título</label>
          <input
            id="rename-conversation-title"
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          {error && <p className={styles.formError} role="alert">{error}</p>}
          <footer>
            <button disabled={submitting} onClick={onClose} type="button">
              Cancelar
            </button>
            <button className={styles.primary} disabled={submitting} type="submit">
              {submitting ? 'Guardando…' : 'Guardar'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
