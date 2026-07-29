import { useEffect, useRef, useState } from 'react'

import type { AgentAssignment, AgentAssignmentInput, AgentId, ConnectionInput, LlmConnection, UserProfile } from '../model/settings-types'
import type { SettingsService } from '../services/settings-service'
import { AgentAssignmentList } from './AgentAssignmentList'
import { ConnectionForm } from './ConnectionForm'
import { SettingsShell } from './SettingsShell'
import { SettingsDialog } from './SettingsDialog'
import styles from './ModelSettingsScreen.module.css'
import shellStyles from './SettingsShell.module.css'

const providerLabels = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  openai_compatible: 'OpenAI compatible',
} as const

type Props = { service: SettingsService; onSignOut?: () => Promise<void> }

export function ModelSettingsScreen({ service, onSignOut = async () => {} }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [connections, setConnections] = useState<LlmConnection[] | null>(null)
  const [assignments, setAssignments] = useState<AgentAssignment[]>([])
  const [editing, setEditing] = useState<LlmConnection | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<LlmConnection | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [attentionAgentIds, setAttentionAgentIds] = useState<Set<AgentId>>(new Set())
  const [retryKey, setRetryKey] = useState(0)
  const [testing, setTesting] = useState<Set<string>>(new Set())
  const [testErrors, setTestErrors] = useState<Record<string, string>>({})
  const [connectionFormDirty, setConnectionFormDirty] = useState(false)
  const connectionNameRef = useRef<HTMLInputElement>(null)

  async function fetchCollections() {
    return Promise.all([service.listConnections(), service.listAgentAssignments()])
  }

  async function load() {
    try {
      const [nextConnections, nextAssignments] = await fetchCollections()
      setConnections(nextConnections)
      setAssignments(nextAssignments)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }

  useEffect(() => {
    let current = true
    fetchCollections()
      .then(([nextConnections, nextAssignments]) => {
        if (!current) return
        setConnections(nextConnections)
        setAssignments(nextAssignments)
        setLoadError(false)
      })
      .catch(() => { if (current) setLoadError(true) })
    return () => { current = false }
  // fetchCollections closes only over the service prop; retryKey intentionally triggers a retry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey, service])
  useEffect(() => { service.getProfile().then(setProfile).catch(() => {}) }, [service])

  async function save(input: ConnectionInput) {
    if (editing) await service.updateConnection(editing.id, input)
    else await service.createConnection(input)
    await load()
    setConnectionFormDirty(false)
    setEditing(undefined)
  }

  async function remove() {
    if (!deleting) return
    const affectedAgentIds = assignments
      .filter((assignment) => assignment.connectionId === deleting.id)
      .map((assignment) => assignment.agentId)
    setDeleteError('')
    try {
      await service.deleteConnection(deleting.id)
      await load()
      setAttentionAgentIds((current) => new Set([...current, ...affectedAgentIds]))
      setDeleting(null)
    } catch {
      setDeleteError('No pudimos eliminar la conexión. Inténtalo de nuevo.')
    }
  }

  async function test(connectionId: string) {
    setTesting((current) => new Set([...current, connectionId]))
    setTestErrors((current) => {
      const next = { ...current }
      delete next[connectionId]
      return next
    })
    try {
      const result = await service.testConnection(connectionId)
      if (!result.ok) {
        setTestErrors((current) => ({ ...current, [connectionId]: result.error }))
      }
      await load()
    } catch {
      setTestErrors((current) => ({
        ...current,
        [connectionId]: 'No pudimos probar la conexión. Inténtalo de nuevo.',
      }))
    } finally {
      setTesting((current) => {
        const next = new Set(current)
        next.delete(connectionId)
        return next
      })
    }
  }

  const isAssigned = deleting && assignments.some((item) => item.connectionId === deleting.id)

  function dismissConnectionForm() {
    if (connectionFormDirty && !window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) return
    setConnectionFormDirty(false)
    setEditing(undefined)
  }

  async function saveAssignment(agentId: AgentId, input: AgentAssignmentInput) {
    const saved = await service.updateAgentAssignment(agentId, input)
    setAssignments((current) => current.some((item) => item.agentId === agentId)
      ? current.map((item) => item.agentId === agentId ? saved : item)
      : [...current, saved])
    setAttentionAgentIds((current) => {
      const next = new Set(current)
      next.delete(agentId)
      return next
    })
    return saved
  }

  return (
    <SettingsShell onSignOut={onSignOut} userEmail={profile?.email ?? ''} userName={profile?.name ?? 'Cuenta'}>
      <header className={`${shellStyles.pageHeader} ${styles.pageHeader}`}>
        <div>
          <p>Configuración de IA</p>
          <h1>Modelos y providers</h1>
          <span>Conecta proveedores y decide qué modelo utiliza cada agente.</span>
        </div>
        <button className={styles.primaryButton} onClick={() => { setConnectionFormDirty(false); setEditing(null) }} type="button">
          <span aria-hidden="true">+</span>
          Nueva conexión
        </button>
      </header>
      {loadError ? <section className={shellStyles.loadState}><p role="alert">No pudimos cargar las conexiones. Inténtalo de nuevo.</p><button onClick={() => setRetryKey((value) => value + 1)} type="button">Reintentar</button></section> : null}
      {connections ? (
        <div className={styles.sections}>
        <section aria-labelledby="connections-title" className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="connections-title">Conexiones</h2>
              <p>Credenciales y endpoints disponibles para el ecosistema.</p>
            </div>
            <span>{connections.length} {connections.length === 1 ? 'conexión' : 'conexiones'}</span>
          </div>
          {connections.length === 0 ? (
            <div className={styles.emptyState}>
              <span aria-hidden="true">✦</span>
              <div><strong>Todavía no tienes conexiones.</strong><p>Agrega un provider para comenzar a asignar modelos.</p></div>
            </div>
          ) : (
            <ul className={styles.connectionList}>
              {connections.map((item) => (
                <li aria-label={item.label} className={styles.connectionRow} key={item.id}>
                  <span aria-hidden="true" className={styles.providerMark}>{providerLabels[item.provider].slice(0, 2)}</span>
                  <div className={styles.connectionIdentity}>
                    <strong>{item.label}</strong>
                    <span>{providerLabels[item.provider]}</span>
                  </div>
                  <div className={styles.connectionEndpoint}>
                    <span>{item.keyHint ? `••••${item.keyHint}` : 'Sin API key'}</span>
                    {item.baseUrl ? <small>{item.baseUrl}</small> : <small>Endpoint administrado</small>}
                  </div>
                  <span
                    className={
                      item.lastTestStatus === 'ok'
                        ? styles.connectedStatus
                        : item.lastTestStatus === 'failed'
                          ? styles.failedStatus
                          : styles.untestedStatus
                    }
                  >
                    <i aria-hidden="true" />
                    {item.lastTestStatus === 'ok'
                      ? 'Conectado'
                      : item.lastTestStatus === 'failed'
                        ? 'Falló'
                        : 'Sin probar'}
                  </span>
                  <div className={styles.rowActions}>
                    <button
                      aria-label={`Probar ${item.label}`}
                      disabled={testing.has(item.id)}
                      onClick={() => void test(item.id)}
                      type="button"
                    >
                      {testing.has(item.id) ? 'Probando…' : 'Probar'}
                    </button>
                    <button aria-label={`Editar ${item.label}`} onClick={() => { setConnectionFormDirty(false); setEditing(item) }} type="button">Editar</button>
                    <button aria-label={`Eliminar ${item.label}`} onClick={() => setDeleting(item)} type="button">Eliminar</button>
                  </div>
                  {testErrors[item.id] ? (
                    <p className={styles.testError} role="alert">{testErrors[item.id]}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="agent-assignments-title" className={styles.section}>
          <div className={styles.sectionHeading}>
            <div><h2 id="agent-assignments-title">Asignaciones por agente</h2><p>Cada agente puede utilizar una conexión y un modelo diferente.</p></div>
          </div>
          <AgentAssignmentList
            assignments={assignments}
            attentionAgentIds={attentionAgentIds}
            connections={connections}
            onSave={saveAssignment}
          />
        </section>
        </div>
      ) : !loadError ? <p aria-busy="true">Cargando conexiones…</p> : null}
      {editing !== undefined ? (
        <SettingsDialog ariaLabel={editing ? 'Editar conexión' : 'Nueva conexión'} initialFocusRef={connectionNameRef} onDismiss={dismissConnectionForm}>
          <p className={styles.dialogEyebrow}>{editing ? 'Actualizar provider' : 'Conectar provider'}</p>
          <h2>{editing ? 'Editar conexión' : 'Nueva conexión'}</h2>
          <p className={styles.dialogDescription}>Las credenciales permanecerán ocultas después de guardarlas.</p>
          <ConnectionForm connection={editing} nameInputRef={connectionNameRef} onCancel={dismissConnectionForm} onDirtyChange={setConnectionFormDirty} onSave={save} />
        </SettingsDialog>
      ) : null}
      {deleting ? (
        <SettingsDialog ariaLabel="Eliminar conexión" onDismiss={() => setDeleting(null)}>
          <h2>Eliminar conexión</h2>
          <p>{isAssigned ? 'Esta conexión está asignada a uno o más agentes. Sus asignaciones se quitarán.' : 'Esta acción no se puede deshacer.'}</p>
          {deleteError ? <p role="alert">{deleteError}</p> : null}
          <div className={styles.dialogActions}>
            <button onClick={() => setDeleting(null)} type="button">Cancelar</button>
            <button className={styles.dangerButton} onClick={() => void remove()} type="button">Confirmar eliminación</button>
          </div>
        </SettingsDialog>
      ) : null}
    </SettingsShell>
  )
}
