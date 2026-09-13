import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import type { ProjectInput, WorkspaceProjectDetail } from '../model/workspace-types'
import styles from './ProjectsScreen.module.css'

type EditProjectDialogProps = {
  initialName: string
  initialDescription: string
  updateProject(input: ProjectInput): Promise<WorkspaceProjectDetail>
  onClose(): void
  onUpdated(project: WorkspaceProjectDetail): void
}

export function EditProjectDialog({
  initialName,
  initialDescription,
  updateProject,
  onClose,
  onUpdated,
}: EditProjectDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const input = dialogRef.current?.querySelector<HTMLInputElement>('#edit-project-name')
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
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Escribe un nombre para el proyecto.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const updated = await updateProject({ name: trimmedName, description: description.trim() })
      onUpdated(updated)
    } catch {
      setError('No pudimos actualizar el proyecto. Inténtalo de nuevo.')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.backdrop}>
      <div
        aria-labelledby="edit-project-title"
        aria-modal="true"
        className={styles.dialog}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <p>Organiza tu trabajo</p>
          <h2 id="edit-project-title">Editar proyecto</h2>
        </header>
        <form onSubmit={handleSubmit}>
          <label htmlFor="edit-project-name">Nombre</label>
          <input
            id="edit-project-name"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <label htmlFor="edit-project-description">
            Descripción <span>(opcional)</span>
          </label>
          <textarea
            id="edit-project-description"
            maxLength={240}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            value={description}
          />
          {error && <p className={styles.formError} role="alert">{error}</p>}
          <footer>
            <button disabled={submitting} onClick={onClose} type="button">
              Cancelar
            </button>
            <button className={styles.primary} disabled={submitting} type="submit">
              {submitting ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
