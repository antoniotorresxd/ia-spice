import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, Sparkles, User } from 'lucide-react'

type AssistantMode = 'minimized' | 'expanded'

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  time: string
}

const QUICK_SUGGESTIONS = [
  'Analizar netlist SPICE',
  'Punto de operación (DC OP)',
  'Respuesta en frecuencia (AC)',
]

export function AssistantPanel({ defaultMode }: { defaultMode?: AssistantMode | 'compact' } = {}) {
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    if (defaultMode) return defaultMode === 'minimized'
    try {
      const stored = localStorage.getItem('spice_assistant_minimized')
      if (stored !== null) return stored === 'true'
    } catch {
      // Storage unavailable
    }
    return false
  })

  const mode: AssistantMode = isMinimized ? 'minimized' : 'expanded'
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      text: 'Hola. Soy el asistente de soporte del Ecosistema Multiagente. Puedo orientarte sobre cómo configurar simulaciones, interpretar netlists o revisar asignaciones de modelos.',
      time: 'Ahora',
    },
  ])
  const [inputText, setInputText] = useState('')
  const openerRef = useRef<HTMLButtonElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageSeqRef = useRef(1)

  useEffect(() => {
    if (mode !== 'minimized' && typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, mode])

  function minimize() {
    setIsMinimized(true)
    try {
      localStorage.setItem('spice_assistant_minimized', 'true')
    } catch {
      // Storage unavailable
    }
  }

  function open() {
    setIsMinimized(false)
    try {
      localStorage.setItem('spice_assistant_minimized', 'false')
    } catch {
      // Storage unavailable
    }
  }

  function closeAndRestoreFocus() {
    minimize()
    queueMicrotask(() => openerRef.current?.focus())
  }

  function handleSend(textToSend?: string) {
    const text = (textToSend ?? inputText).trim()
    if (!text) return

    const seq = messageSeqRef.current++
    const userMsg: ChatMessage = {
      id: `user-${seq}`,
      role: 'user',
      text,
      time: 'Ahora',
    }

    const assistantReply: ChatMessage = {
      id: `ai-${seq}`,
      role: 'assistant',
      text: `Recibido: "${text}". Para iniciar la simulación completa con los agentes de Cálculo y Curador, crea una "Nueva solicitud" en el menú lateral o escribe en una conversación activa.`,
      time: 'Ahora',
    }

    setMessages((prev) => [...prev, userMsg, assistantReply])
    setInputText('')
  }

  return (
    <div className="home-assistant-shell">
      <button
        aria-label="Abrir asistente"
        className="home-assistant-opener"
        hidden={mode !== 'minimized'}
        onClick={open}
        ref={openerRef}
        type="button"
      >
        <span aria-hidden="true" className="home-assistant-opener-mark">
          EM
        </span>
        <span aria-hidden="true" className="home-assistant-availability" />
      </button>
      {mode === 'minimized' ? (
        <span className="home-assistant-tooltip" role="tooltip">
          Abrir asistente
        </span>
      ) : null}

      {mode !== 'minimized' ? (
        <section
          aria-label="Asistente del Ecosistema Multiagente"
          className="home-assistant"
          data-mode={mode}
          role="dialog"
        >
          <header>
            <div className="home-assistant-header-left">
              <span aria-hidden="true" className="home-assistant-mark">
                EM
              </span>
              <div className="home-assistant-identity">
                <strong>Asistente</strong>
                <span className="home-assistant-online-badge">
                  <span className="home-assistant-online-dot" />
                  En línea
                </span>
              </div>
            </div>
            <div className="home-assistant-actions">
              <button onClick={minimize} type="button">
                Minimizar asistente
              </button>
              <button onClick={closeAndRestoreFocus} type="button">
                Cerrar asistente
              </button>
            </div>
          </header>

          <div className="home-assistant-body">
            <div className="home-assistant-messages">
              {messages.map((msg) => (
                <div
                  className={`home-assistant-message home-assistant-message-${msg.role}`}
                  key={msg.id}
                >
                  <div className="home-assistant-message-header">
                    <span className="home-assistant-message-sender">
                      {msg.role === 'assistant' ? (
                        <>
                          <Bot size={12} />
                          <span>Ecosistema</span>
                        </>
                      ) : (
                        <>
                          <User size={12} />
                          <span>Tú</span>
                        </>
                      )}
                    </span>
                    <span className="home-assistant-message-time">{msg.time}</span>
                  </div>
                  <p className="home-assistant-message-content">{msg.text}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="home-assistant-suggestions">
              <span className="home-assistant-suggestions-title">
                <Sparkles size={11} />
                Sugerencias
              </span>
              <div className="home-assistant-chips">
                {QUICK_SUGGESTIONS.map((suggestion) => (
                  <button
                    className="home-assistant-chip"
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <form
              className="home-assistant-composer"
              onSubmit={(e) => {
                e.preventDefault()
                handleSend()
              }}
            >
              <input
                aria-label="Pregunta algo sobre SPICE…"
                autoComplete="off"
                className="home-assistant-input"
                id="home-assistant-input"
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Pregunta algo sobre SPICE…"
                type="text"
                value={inputText}
              />
              <button
                aria-label="Enviar mensaje al asistente"
                className="home-assistant-send-btn"
                disabled={!inputText.trim()}
                type="submit"
              >
                <ArrowUp size={14} />
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  )
}
