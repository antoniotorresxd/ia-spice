import { useEffect, useState } from 'react'

import type { AgentAssignment, ConnectionInput, LlmConnection, UserProfile } from '../model/settings-types'
import type { SettingsService } from '../services/settings-service'
import { ConnectionForm } from './ConnectionForm'
import { SettingsShell } from './SettingsShell'
import styles from './SettingsShell.module.css'

type Props = { service: SettingsService; onSignOut?: () => Promise<void> }

export function ModelSettingsScreen({ service, onSignOut = async () => {} }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [connections, setConnections] = useState<LlmConnection[] | null>(null)
  const [assignments, setAssignments] = useState<AgentAssignment[]>([])
  const [editing, setEditing] = useState<LlmConnection | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<LlmConnection | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

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
    setEditing(undefined)
  }

  async function remove() {
    if (!deleting) return
    setDeleteError('')
    try {
      await service.deleteConnection(deleting.id)
      await load()
      setDeleting(null)
    } catch {
      setDeleteError('No pudimos eliminar la conexión. Inténtalo de nuevo.')
    }
  }

  const isAssigned = deleting && assignments.some((item) => item.connectionId === deleting.id)

  return (
    <SettingsShell onSignOut={onSignOut} userEmail={profile?.email ?? ''} userName={profile?.name ?? 'Cuenta'}>
      <header className={styles.pageHeader}>
        <p>Configuración de IA</p>
        <h1>Modelos y providers</h1>
        <span>Administra las credenciales y endpoints disponibles.</span>
      </header>
      {loadError ? <section className={styles.loadState}><p role="alert">No pudimos cargar las conexiones. Inténtalo de nuevo.</p><button onClick={() => setRetryKey((value) => value + 1)} type="button">Reintentar</button></section> : null}
      {connections ? (
        <section>
          <button onClick={() => setEditing(null)} type="button">Nueva conexión</button>
          {connections.length === 0 ? <p>Todavía no tienes conexiones.</p> : (
            <ul>
              {connections.map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong> <span>{item.provider}</span>
                  {item.keyHint ? <span>••••{item.keyHint}</span> : <span>Sin API key</span>}
                  {item.baseUrl ? <span>{item.baseUrl}</span> : null}
                  <button aria-label={`Editar ${item.label}`} onClick={() => setEditing(item)} type="button">Editar</button>
                  <button aria-label={`Eliminar ${item.label}`} onClick={() => setDeleting(item)} type="button">Eliminar</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : !loadError ? <p aria-busy="true">Cargando conexiones…</p> : null}
      {editing !== undefined ? (
        <section aria-label={editing ? 'Editar conexión' : 'Nueva conexión'} role="dialog">
          <h2>{editing ? 'Editar conexión' : 'Nueva conexión'}</h2>
          <ConnectionForm connection={editing} onCancel={() => setEditing(undefined)} onSave={save} />
        </section>
      ) : null}
      {deleting ? (
        <section aria-label="Eliminar conexión" role="dialog">
          <h2>Eliminar conexión</h2>
          <p>{isAssigned ? 'Esta conexión está asignada a uno o más agentes. Sus asignaciones se quitarán.' : 'Esta acción no se puede deshacer.'}</p>
          {deleteError ? <p role="alert">{deleteError}</p> : null}
          <button onClick={() => setDeleting(null)} type="button">Cancelar</button>
          <button onClick={() => void remove()} type="button">Confirmar eliminación</button>
        </section>
      ) : null}
    </SettingsShell>
  )
}
