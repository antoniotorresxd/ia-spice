import { useRef, useState } from 'react'

type AssistantMode = 'minimized' | 'compact' | 'expanded'

export function AssistantPanel() {
  const [mode, setMode] = useState<AssistantMode>('compact')
  const openerRef = useRef<HTMLButtonElement>(null)

  function minimize() {
    setMode('minimized')
  }

  function closeAndRestoreFocus() {
    setMode('minimized')
    queueMicrotask(() => openerRef.current?.focus())
  }

  return (
    <div className="home-assistant-shell">
      <button
        aria-label="Abrir asistente"
        className="home-assistant-opener"
        hidden={mode !== 'minimized'}
        onClick={() => setMode('compact')}
        ref={openerRef}
        type="button"
      >
        <span aria-hidden="true" className="home-assistant-opener-mark">
          EM
        </span>
        <span aria-hidden="true" className="home-assistant-availability" />
      </button>
      <span className="home-assistant-tooltip" role="tooltip">
        Abrir asistente
      </span>

      {mode !== 'minimized' ? (
        <section
          aria-label="Asistente del Ecosistema Multiagente"
          className="home-assistant"
          data-mode={mode}
          role="dialog"
        >
          <header>
            <div>
              <span aria-hidden="true" className="home-assistant-mark">
                EM
              </span>
              <strong>Asistente</strong>
              <small>Demo</small>
            </div>
            <div className="home-assistant-actions">
              <button onClick={minimize} type="button">
                Minimizar asistente
              </button>
              <button
                onClick={() =>
                  setMode(mode === 'compact' ? 'expanded' : 'compact')
                }
                type="button"
              >
                {mode === 'compact'
                  ? 'Expandir asistente'
                  : 'Contraer asistente'}
              </button>
              <button onClick={closeAndRestoreFocus} type="button">
                Cerrar asistente
              </button>
            </div>
          </header>
          <div className="home-assistant-body">
            <p>
              Puedo ayudarte a interpretar resultados, ajustar restricciones o
              iniciar una nueva iteración.
            </p>
            <label>
              <span>Disponible al conectar el backend</span>
              <textarea disabled rows={2} value="" readOnly />
            </label>
          </div>
        </section>
      ) : null}
    </div>
  )
}
