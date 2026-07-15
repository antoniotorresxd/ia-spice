import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import type { WorkspaceService } from '../services/workspace-service'
import styles from './NewRequestScreen.module.css'

type NewRequestScreenProps = {
  service: WorkspaceService
}

const examples = [
  { label: 'Filtro RC', prompt: 'Diseña un filtro RC pasa bajas de 1 kHz' },
  { label: 'Amplificador BJT', prompt: 'Diseña un amplificador BJT de emisor común' },
  { label: 'Fuente regulada', prompt: 'Diseña una fuente regulada de 5 V' },
]

export function NewRequestScreen({ service }: NewRequestScreenProps) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedText = text.trim()

    if (!normalizedText) {
      setError('Escribe una solicitud antes de continuar.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const conversation = await service.submitRequest(normalizedText)
      navigate(`/conversations/${conversation.id}`)
    } catch {
      setError('No pudimos iniciar la solicitud. Inténtalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className={styles.screen}>
      <div className={styles.request}>
        <header className={styles.intro}>
          <h2>Nueva solicitud</h2>
          <h1>¿Qué quieres diseñar?</h1>
          <p>Describe el circuito, restricciones o resultado que necesitas.</p>
        </header>

        <form className={styles.composer} onSubmit={handleSubmit}>
          <label className={styles.srOnly} htmlFor="new-request-prompt">Describe qué quieres diseñar</label>
          <textarea
            aria-describedby={error ? 'new-request-error' : undefined}
            disabled={isSubmitting}
            id="new-request-prompt"
            onChange={(event) => setText(event.target.value)}
            placeholder="Diseña un filtro pasa bajas de 1 kHz alimentado a 5 V…"
            rows={5}
            value={text}
          />
          <div className={styles.tools}>
            <button className={styles.context} disabled={isSubmitting} type="button">
              <span aria-hidden="true">＋</span> Contexto
            </button>
            <span className={styles.mode}><span aria-hidden="true">✦</span> Automático</span>
            <button className={styles.submit} disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Enviando…' : 'Enviar solicitud'} <span aria-hidden="true">↑</span>
            </button>
          </div>
        </form>

        {error ? <p className={styles.error} id="new-request-error" role="alert">{error}</p> : null}

        <div aria-label="Ejemplos de solicitudes" className={styles.examples}>
          {examples.map((example) => (
            <button
              aria-label={`Usar ejemplo: ${example.label}`}
              disabled={isSubmitting}
              key={example.label}
              onClick={() => { setText(example.prompt); setError(null) }}
              type="button"
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
