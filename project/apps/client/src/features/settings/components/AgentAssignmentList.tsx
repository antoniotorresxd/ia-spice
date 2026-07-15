import { useState } from 'react'

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
  onSave(agentId: AgentId, input: AgentAssignmentInput): Promise<AgentAssignment>
}

type RowProps = {
  assignment: AgentAssignment
  attention: boolean
  connections: LlmConnection[]
  onSave(agentId: AgentId, input: AgentAssignmentInput): Promise<AgentAssignment>
}

function AssignmentRow({ assignment, attention, connections, onSave }: RowProps) {
  const [connectionId, setConnectionId] = useState(assignment.connectionId ?? '')
  const [model, setModel] = useState(assignment.model)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)

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

  const configured = Boolean(connectionId && model.trim())

  return (
    <li aria-label={assignment.label} className={styles.assignmentRow}>
      <div className={styles.agentIdentity}>
        <span aria-hidden="true">{assignment.label.slice(0, 1)}</span>
        <div><h3>{assignment.label}</h3><small>Agente especializado</small></div>
      </div>
      <label>
        <span>Conexión</span>
        <select value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>
          <option value="">Sin conexión</option>
          {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.label}</option>)}
        </select>
      </label>
      <label>
        <span>Modelo</span>
        <input value={model} onChange={(event) => setModel(event.target.value)} />
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

export function AgentAssignmentList({ assignments, attentionAgentIds = new Set(), connections, onSave }: Props) {
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
            onSave={onSave}
          />
        )
      })}
    </ul>
  )
}
