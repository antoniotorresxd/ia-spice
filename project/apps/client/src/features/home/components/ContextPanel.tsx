import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { ConversationExecution } from '../model/home-types'

type ContextPanelProps = {
  execution: ConversationExecution | null
  isOpen: boolean
  onClose: () => void
}

// Keep this query aligned with HomeScreen.module.css.
const overlayQuery = '(max-width: 1024px)'
const focusableSelector =
  'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]'

function subscribeToOverlay(onChange: () => void) {
  const media = window.matchMedia(overlayQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getOverlaySnapshot() {
  return window.matchMedia(overlayQuery).matches
}

export function ContextPanel({ execution, isOpen, onClose }: ContextPanelProps) {
  const isOverlay = useSyncExternalStore(subscribeToOverlay, getOverlaySnapshot, () => false)
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const panel = panelRef.current
    if (!isOverlay || !isOpen || !panel) return

    const returnTo = document.activeElement
    const focusInside = () => (closeRef.current ?? panel).focus({ preventScroll: true })
    const handleFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target)) focusInside()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((node) => node.tabIndex >= 0 && !node.matches(':disabled') &&
          !node.closest('[inert], [hidden]') && node.getClientRects().length > 0 &&
          getComputedStyle(node).visibility !== 'hidden')
      const first = nodes[0] ?? panel
      const last = nodes[nodes.length - 1] ?? panel
      const active = document.activeElement
      if (!nodes.length || !nodes.some((node) => node === active) ||
        (event.shiftKey ? active === first : active === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus({ preventScroll: true })
      }
    }

    focusInside()
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocus)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocus)
      if (returnTo instanceof HTMLElement && returnTo.isConnected) {
        returnTo.focus({ preventScroll: true })
      }
    }
  }, [isOverlay, isOpen])

  return (
    <>
      {isOverlay && (
        <button
          aria-label="Cerrar detalles desde el fondo"
          aria-hidden="true"
          className="home-context-scrim"
          data-open={isOpen}
          disabled={!isOpen}
          onClick={onClose}
          tabIndex={-1}
          type="button"
        />
      )}
      <aside
        ref={panelRef}
        aria-label="Detalles contextuales"
        aria-modal={isOverlay && isOpen ? true : undefined}
        className="home-context"
        data-open={isOpen}
        inert={isOverlay && !isOpen}
        role={isOverlay ? 'dialog' : undefined}
        tabIndex={isOverlay ? -1 : undefined}
      >
        <header>
          <h2>Detalles</h2>
          <button ref={closeRef} aria-label="Cerrar detalles" onClick={onClose} type="button">
            ×
          </button>
        </header>
        {execution ? (
          <>
            <dl>
              <div>
                <dt>Estado</dt>
                <dd data-status={execution.status}>
                  {execution.status === 'active'
                    ? 'En progreso'
                    : execution.status === 'failed'
                      ? 'Requiere atención'
                      : 'Completada'}
                </dd>
              </div>
              <div>
                <dt>Proyecto</dt>
                <dd>{execution.projectId ?? 'Sin proyecto'}</dd>
              </div>
              <div>
                <dt>Conversación</dt>
                <dd>{execution.conversation.title}</dd>
              </div>
            </dl>
            <section aria-labelledby="context-files-title">
              <h3 id="context-files-title">Archivos</h3>
              <ul>
                {execution.files.map((file) => (
                  <li key={file.id}>
                    <span>{file.name}</span>
                    <span>{file.kind}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <div className="home-context-empty-card">
            <div className="home-context-empty-radar" aria-hidden="true">
              <span className="home-radar-ping" />
              <span className="home-radar-dot" />
            </div>
            <p className="home-context-empty-title">Inspector en espera</p>
            <p className="home-context-empty">
              Selecciona una ejecución para consultar su proyecto, estado y archivos.
            </p>
          </div>
        )}
      </aside>
    </>
  )
}

