import type { HomeOverviewData, UsagePeriod } from '../model/home-types'
import { UsageSummary } from './UsageSummary'

type HomeOverviewProps = {
  data: HomeOverviewData
  onPeriodChange: (period: UsagePeriod) => void
}

function formatUpdate(date: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(date))
}

export function HomeOverview({ data, onPeriodChange }: HomeOverviewProps) {
  const isEmpty =
    data.recentExecutions.length === 0 && data.recentProjects.length === 0

  return (
    <div className="home-overview">
      {data.isDemo ? <p className="home-demo-badge">Datos de demostración</p> : null}
      <UsageSummary usage={data.usage} onPeriodChange={onPeriodChange} />

      {isEmpty ? (
        <section className="home-empty" aria-labelledby="home-empty-title">
          <p className="home-kicker">Tu primer diseño</p>
          <h2 id="home-empty-title">Comienza describiendo un circuito</h2>
          <p>
            Prueba con “Diseña un filtro RC de 1 kHz con tolerancia máxima del
            5 %”.
          </p>
        </section>
      ) : (
        <div className="home-overview-grid">
          <section aria-labelledby="activity-title" className="home-activity-list">
            <header className="home-section-header">
              <h2 id="activity-title">Actividad reciente</h2>
              <span>{data.recentExecutions.length} ejecuciones</span>
            </header>
            <ul>
              {data.recentExecutions.map((execution) => (
                <li key={execution.id}>
                  <span className={`home-status-dot is-${execution.status}`} />
                  <div>
                    <strong>{execution.conversation.title}</strong>
                    <span>
                      {execution.status === 'active'
                        ? 'En progreso'
                        : execution.status === 'failed'
                          ? 'Requiere atención'
                          : 'Completada'}
                    </span>
                  </div>
                  <time dateTime={execution.conversation.updatedAt}>
                    {formatUpdate(execution.conversation.updatedAt)}
                  </time>
                </li>
              ))}
            </ul>
          </section>

          <div className="home-secondary-column">
            <section aria-labelledby="projects-title">
              <h2 id="projects-title">Proyectos recientes</h2>
              <ul>
                {data.recentProjects.map((project) => (
                  <li key={project.id}>
                    <strong>{project.name}</strong>
                    <span>{project.conversationCount} conversaciones</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="files-title">
              <h2 id="files-title">Archivos recientes</h2>
              <ul>
                {data.recentFiles.slice(0, 3).map((file) => (
                  <li key={file.id}>
                    <strong>{file.name}</strong>
                    <span>{file.kind}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
