import { useState, type FormEvent } from 'react'

type NaturalLanguageComposerProps = {
  onSubmit: (text: string) => Promise<void>
}

export function NaturalLanguageComposer({
  onSubmit,
}: NaturalLanguageComposerProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedText = text.trim()

    if (!normalizedText) {
      setError('Escribe una solicitud antes de continuar.')
      return
    }

    setError(null)
    setStatus('Iniciando solicitud…')
    setIsSubmitting(true)

    try {
      await onSubmit(normalizedText)
      setText('')
      setStatus('Solicitud iniciada.')
    } catch {
      setError('No pudimos iniciar la solicitud. Inténtalo de nuevo.')
      setStatus('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="home-composer" onSubmit={handleSubmit}>
      <label htmlFor="home-prompt">Describe qué quieres diseñar</label>
      <div className="home-composer-control">
        <textarea
          aria-describedby={error ? 'home-prompt-error' : undefined}
          disabled={isSubmitting}
          id="home-prompt"
          onChange={(event) => setText(event.target.value)}
          placeholder="Ej. Diseña un filtro RC de 1 kHz…"
          rows={2}
          value={text}
        />
        <button disabled={isSubmitting} type="submit">
          <span>{isSubmitting ? 'Enviando…' : 'Enviar solicitud'}</span>
          <span aria-hidden="true">↑</span>
        </button>
      </div>
      {error ? (
        <p id="home-prompt-error" role="alert">
          {error}
        </p>
      ) : null}
      <p aria-live="polite" className="home-sr-status">
        {status}
      </p>
    </form>
  )
}

