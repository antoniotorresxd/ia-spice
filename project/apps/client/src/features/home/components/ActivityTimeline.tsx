import { useState } from 'react'

import type {
  ConversationExecution,
  ExecutionStage,
} from '../model/home-types'
import styles from './ActivityTimeline.module.css'

type ActivityTimelineProps = {
  execution: ConversationExecution
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return 'Pendiente'
  return durationMs >= 1000
    ? `${(durationMs / 1000).toFixed(1)} s`
    : `${durationMs} ms`
}

function StageSummary({ stage }: { stage: ExecutionStage }) {
  if (stage.status === 'failed') {
    return <p role="alert">{stage.summary}</p>
  }
  if (stage.status === 'active') {
    return <p role="status">{stage.summary}</p>
  }
  return <p>{stage.summary}</p>
}

export function ActivityTimeline({ execution }: ActivityTimelineProps) {
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null)

  return (
    <section aria-labelledby="execution-title" className={styles.timelinePanel}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>
            Ejecución {execution.id.replace('execution-', '#')}
          </p>
          <h2 id="execution-title">{execution.conversation.title}</h2>
          <p>
            {execution.projectId ? 'Proyecto asignado' : 'Sin proyecto'} ·{' '}
            {execution.status === 'active'
              ? 'En curso'
              : execution.status === 'failed'
                ? 'Fallida'
                : 'Completada'}
          </p>
        </div>
        <span className={styles.executionStatus} data-status={execution.status}>
          {execution.status === 'active'
            ? 'En progreso'
            : execution.status === 'failed'
              ? 'Requiere atención'
              : 'Validada'}
        </span>
      </header>

      <ol aria-label="Actividad de ejecución" className={styles.timeline}>
        {execution.stages.map((stage) => {
          const isExpanded = expandedStageId === stage.id
          const hasMetrics = stage.metrics.length > 0

          return (
            <li
              className={styles.stage}
              data-status={stage.status}
              key={stage.id}
            >
              <span aria-hidden="true" className={styles.node} />
              <article className={styles.stageCard}>
                <header>
                  <div className={styles.stageIdentity}>
                    <span aria-hidden="true" className={styles.actorMark}>
                      {stage.actor.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <h3>{stage.label}</h3>
                      <span>{stage.actor}</span>
                    </div>
                  </div>
                  <time>{formatDuration(stage.durationMs)}</time>
                </header>
                <StageSummary stage={stage} />
                {hasMetrics ? (
                  <>
                    <button
                      aria-expanded={isExpanded}
                      className={styles.detailsButton}
                      onClick={() =>
                        setExpandedStageId(isExpanded ? null : stage.id)
                      }
                      type="button"
                    >
                      {isExpanded ? 'Ocultar' : 'Ver'} detalles de {stage.label}
                    </button>
                    {isExpanded ? (
                      <dl className={styles.metrics}>
                        {stage.metrics.map((metric) => (
                          <div key={metric.label}>
                            <dt>{metric.label}</dt>
                            <dd>
                              {metric.label}: {metric.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </>
                ) : null}
              </article>
            </li>
          )
        })}
      </ol>

      {execution.files.length > 0 ? (
        <section aria-labelledby="execution-files-title" className={styles.files}>
          <h3 id="execution-files-title">Archivos generados</h3>
          <ul>
            {execution.files.map((file) => (
              <li key={file.id}>
                <span>{file.name}{file.partial ? ' · parcial' : ''}</span>
                <span>{file.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  )
}

