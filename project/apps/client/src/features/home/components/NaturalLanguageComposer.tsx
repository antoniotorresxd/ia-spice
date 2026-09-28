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
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[var(--muted-foreground)] text-[0.72rem]">Sugerencias rápidas:</span>
        {[
          'Filtro pasa bajas RC 1 kHz',
          'Divisor de voltaje 5V a 3.3V',
          'Amplificador no inversor Av=10',
          'LED con resistencia para 5V',
        ].map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setText(`Diseña un ${chip.toLowerCase()}`)}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)]/70 px-2.5 py-1 text-[0.73rem] text-[var(--muted-foreground)] transition-colors hover:border-[var(--color-mint)]/50 hover:bg-[var(--accent)] hover:text-[var(--color-mint)]"
          >
            {chip}
          </button>
        ))}
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

