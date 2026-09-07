import { useEffect, useState } from 'react'

import type { AgentAssignment, AgentAssignmentInput, AgentId, LlmConnection } from '../model/settings-types'
import styles from './ModelSettingsScreen.module.css'

const agents: ReadonlyArray<Pick<AgentAssignment, 'agentId' | 'label'>> = [
  { agentId: 'orchestrator', label: 'Orquestador' },
  { agentId: 'calculation', label: 'Cálculo' },
  { agentId: 'writer', label: 'Escritura' },
  { agentId: 'curator', label: 'Curador' },
]

type Props = {
  assignments: AgentAssignment[]
  attentionAgentIds?: ReadonlySet<AgentId>
  connections: LlmConnection[]
  onFetchModels?: (connectionId: string) => Promise<string[]>
  onSave(agentId: AgentId, input: AgentAssignmentInput): Promise<AgentAssignment>
}

type RowProps = {
  assignment: AgentAssignment
  attention: boolean
  connections: LlmConnection[]
  onFetchModels?: (connectionId: string) => Promise<string[]>
  onSave(agentId: AgentId, input: AgentAssignmentInput): Promise<AgentAssignment>
}

function AssignmentRow({ assignment, attention, connections, onFetchModels, onSave }: RowProps) {
  const [connectionId, setConnectionId] = useState(assignment.connectionId ?? '')
  const [model, setModel] = useState(assignment.model)
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    if (!connectionId || !onFetchModels) {
      return
    }
    queueMicrotask(() => {
      if (current) setIsFetchingModels(true)
    })
    onFetchModels(connectionId)
      .then((models) => {
        if (current && Array.isArray(models)) {
          setDiscoveredModels(models)
        }
      })
      .catch(() => {
        if (current) setDiscoveredModels([])
      })
      .finally(() => {
        if (current) setIsFetchingModels(false)
      })
    return () => { current = false }
  }, [connectionId, onFetchModels])

  async function save() {
    setSubmitting(true)
    setError(false)
    try {
      await onSave(assignment.agentId, { connectionId: connectionId || null, model })
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  const [isManualInput, setIsManualInput] = useState(false)

  const configured = Boolean(connectionId && model.trim())
  const hasDiscovered = discoveredModels.length > 0

  return (
    <li aria-label={assignment.label} className={styles.assignmentRow}>
      <div className={styles.agentIdentity}>
        <span aria-hidden="true">{assignment.label.slice(0, 1)}</span>
        <div>
          <h3>{assignment.label}</h3>
          <small>{isFetchingModels ? 'Consultando modelos…' : 'Agente especializado'}</small>
        </div>
      </div>
      <label>
        <span>Conexión</span>
        <select
          value={connectionId}
          onChange={(event) => {
            setConnectionId(event.target.value)
            setDiscoveredModels([])
            setIsManualInput(false)
          }}
        >
          <option value="">Sin conexión</option>
          {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.label}</option>)}
        </select>
      </label>
      <label>
        <span>Modelo</span>
        {hasDiscovered && !isManualInput ? (
          <select
            value={discoveredModels.includes(model) ? model : (model ? '__current__' : '')}
            onChange={(event) => {
              const val = event.target.value
              if (val === '__custom__') {
                setIsManualInput(true)
              } else if (val !== '__current__') {
                setModel(val)
              }
            }}
          >
            <option value="">Selecciona un modelo…</option>
            {model && !discoveredModels.includes(model) ? (
              <option value="__current__">{model} (actual)</option>
            ) : null}
            {discoveredModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value="__custom__">✏️ Escribir otro modelo…</option>
          </select>
        ) : (
          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            <input
              placeholder={discoveredModels[0] ? `Ej. ${discoveredModels[0]}` : 'Nombre del modelo…'}
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
            {hasDiscovered && (
              <button
                type="button"
                onClick={() => setIsManualInput(false)}
                title="Volver al desplegable de modelos"
                className={styles.modelToggleBtn}
              >
                Lista
              </button>
            )}
          </div>
        )}
      </label>
      <p className={configured ? styles.configuredStatus : styles.unconfiguredStatus}
        aria-label={attention ? `Asignación de ${assignment.label} requiere atención` : undefined}
        role={attention ? 'alert' : undefined}
      >
        {configured ? 'Configurado' : 'Sin configurar'}
      </p>
      {error ? <p className={styles.assignmentError} role="alert">No pudimos guardar la asignación. Inténtalo de nuevo.</p> : null}
      <button className={styles.saveButton} disabled={submitting} onClick={() => void save()} type="button">
        {submitting ? 'Guardando…' : 'Guardar'}
      </button>
    </li>
  )
}

export function AgentAssignmentList({ assignments, attentionAgentIds = new Set(), connections, onFetchModels, onSave }: Props) {
  return (
    <ul aria-label="Asignaciones de agentes" className={styles.assignmentList}>
      {agents.map((agent) => {
        const assignment = assignments.find((item) => item.agentId === agent.agentId) ?? {
          ...agent,
          connectionId: null,
          model: '',
        }
        return (
          <AssignmentRow
            assignment={assignment}
            attention={attentionAgentIds.has(agent.agentId)}
            connections={connections}
            key={`${agent.agentId}:${assignment.connectionId ?? ''}:${assignment.model}`}
            onFetchModels={onFetchModels}
            onSave={onSave}
          />
        )
      })}
    </ul>
  )
}
