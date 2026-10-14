import { Plus, Send, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { MAX_IMAGES } from '../model/image-attachments'
import { useImageAttachments } from '../model/use-image-attachments'
import type { WorkspaceService } from '../services/workspace-service'
import { AttachImageButton, AttachmentPreviews } from './ImageAttachments'
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
  const images = useImageAttachments()

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
      // Sin imágenes la llamada queda como siempre, con un solo argumento.
      const conversation = images.attachments.length
        ? await service.submitRequest(normalizedText, images.attachments)
        : await service.submitRequest(normalizedText)
      navigate(`/conversations/${conversation.id}`)
    } catch {
      setError('No pudimos iniciar la solicitud. Inténtalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className={styles.screen}>
      <div className={styles.spotlight} aria-hidden="true" />
      <div className={styles.request}>
        <header className={styles.intro}>
          <div className={styles.badge}>
            <span className={styles.badgeDot} aria-hidden="true" />
            <h2>Nueva solicitud</h2>
          </div>
          <h1 className={styles.headline}>¿Qué quieres diseñar?</h1>
          <p>Describe el circuito, restricciones o resultado que necesitas.</p>
        </header>

        <form
          className={styles.composer}
          data-dragging={images.isDragging ? 'true' : undefined}
          onSubmit={handleSubmit}
          {...images.dropHandlers}
        >
          <label className={styles.srOnly} htmlFor="new-request-prompt">
            Describe qué quieres diseñar
          </label>
          <textarea
            aria-describedby={error ? 'new-request-error' : undefined}
            disabled={isSubmitting}
            id="new-request-prompt"
            onChange={(event) => setText(event.target.value)}
            onPaste={images.onPaste}
            placeholder="Diseña un filtro pasa bajas de 1 kHz alimentado a 5 V…"
            rows={5}
            value={text}
          />
          <AttachmentPreviews
            attachments={images.attachments}
            disabled={isSubmitting}
            onRemove={images.remove}
          />
          <div className={styles.tools}>
            <button className={styles.context} disabled={isSubmitting} type="button">
              <Plus aria-hidden="true" size={15} /> Contexto
            </button>
            <AttachImageButton
              className={styles.context}
              disabled={isSubmitting}
              full={images.attachments.length >= MAX_IMAGES}
              onFiles={(files) => void images.addFiles(files)}
            >
              Imagen
            </AttachImageButton>
            <span className={styles.mode}>
              <Sparkles aria-hidden="true" size={14} /> Automático
            </span>
            <button className={styles.submit} disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Enviando…' : 'Enviar solicitud'}{' '}
              <Send aria-hidden="true" size={15} />
            </button>
          </div>
        </form>

        {error ? (
          <p className={styles.error} id="new-request-error" role="alert">
            {error}
          </p>
        ) : images.error ? (
          <p className={styles.error} role="alert">
            {images.error}
          </p>
        ) : null}

        <div aria-label="Ejemplos de solicitudes" className={styles.examples}>
          <span className={styles.examplesTitle}>Plantillas rápidas:</span>
          {examples.map((example) => (
            <button
              aria-label={`Usar ejemplo: ${example.label}`}
              disabled={isSubmitting}
              key={example.label}
              onClick={() => {
                setText(example.prompt)
                setError(null)
              }}
              type="button"
            >
              <span className={styles.exampleChipDot} aria-hidden="true" />
              {example.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
