import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import type { ProjectInput, WorkspaceProject } from '../model/workspace-types'
import styles from './ProjectsScreen.module.css'

type CreateProjectDialogProps = {
  createProject(input: ProjectInput): Promise<WorkspaceProject>
  onClose(): void
  onCreated(project: WorkspaceProject): void
}

export function CreateProjectDialog({ createProject, onClose, onCreated }: CreateProjectDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLInputElement>('#project-name')?.focus()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !submitting) {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('input, textarea, button:not(:disabled)') ?? [])]
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
      onCreated(await createProject({ name: trimmedName, description: description.trim() }))
    } catch {
      setError('No pudimos crear el proyecto. Inténtalo de nuevo.')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.backdrop}>
      <div
        aria-labelledby="create-project-title"
        aria-modal="true"
        className={styles.dialog}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <p>Organiza tu trabajo</p>
          <h2 id="create-project-title">Nuevo proyecto</h2>
        </header>
        <form onSubmit={handleSubmit}>
          <label htmlFor="project-name">Nombre</label>
          <input id="project-name" maxLength={80} onChange={(event) => setName(event.target.value)} value={name} />
          <label htmlFor="project-description">Descripción <span>(opcional)</span></label>
          <textarea id="project-description" maxLength={240} onChange={(event) => setDescription(event.target.value)} rows={3} value={description} />
          {error && <p className={styles.formError} role="alert">{error}</p>}
          <footer>
            <button disabled={submitting} onClick={onClose} type="button">Cancelar</button>
            <button className={styles.primary} disabled={submitting} type="submit">
              {submitting ? 'Creando…' : 'Crear proyecto'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
