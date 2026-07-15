import type { ConversationExecution } from '../model/home-types'

type ContextPanelProps = {
  execution: ConversationExecution | null
  isOpen: boolean
  onClose: () => void
}

export function ContextPanel({ execution, isOpen, onClose }: ContextPanelProps) {
  return (
    <aside aria-label="Detalles contextuales" className="home-context" data-open={isOpen}>
      <header>
        <h2>Detalles</h2>
        <button aria-label="Cerrar detalles" onClick={onClose} type="button">
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
        <p className="home-context-empty">
          Selecciona una ejecución para consultar su proyecto, estado y archivos.
        </p>
      )}
    </aside>
  )
}

