import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { WorkspaceSnapshot } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import styles from './ConversationScreen.module.css'

const labels = { active: 'En curso', completed: 'Completada', failed: 'Fallida' } as const
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim()
const dateFormatter = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

export function ConversationsScreen({ service }: { service: WorkspaceService }) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [project, setProject] = useState('all')
  const [status, setStatus] = useState('all')

  useEffect(() => {
    let current = true
    service.getSnapshot().then(
      (next) => { if (current) setSnapshot(next) },
      () => { if (current) setLoadError(true) },
    )
    return () => { current = false }
  }, [service])

  const rows = useMemo(() => {
    const term = normalize(query)
    return (snapshot?.conversations ?? []).filter((conversation) => {
      const projectName = snapshot?.projects.find(({ id }) => id === conversation.projectId)?.name ?? 'Sin proyecto'
      const matchesText = normalize(`${conversation.title} ${conversation.preview} ${projectName}`).includes(term)
      const matchesProject = project === 'all' || (project === 'unassigned' ? conversation.projectId === null : conversation.projectId === project)
      return matchesText && matchesProject && (status === 'all' || conversation.executionStatus === status)
    })
  }, [project, query, snapshot, status])

  return (
    <section aria-labelledby="conversations-title" className={styles.directory}>
      <header><p className={styles.eyebrow}>Workspace</p><h1 id="conversations-title">Conversaciones</h1><p>Consulta solicitudes y ejecuciones de todos tus proyectos.</p></header>
      <div className={styles.filters}>
        <label>Buscar conversaciones<input aria-label="Buscar conversaciones" onChange={(event) => setQuery(event.target.value)} placeholder="Título, solicitud o proyecto…" type="search" value={query} /></label>
        <label>Proyecto<select aria-label="Proyecto" onChange={(event) => setProject(event.target.value)} value={project}><option value="all">Todos</option><option value="unassigned">Sin proyecto</option>{snapshot?.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Estado<select aria-label="Estado" onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">Todos</option><option value="active">En curso</option><option value="completed">Completadas</option><option value="failed">Fallidas</option></select></label>
      </div>
      {!snapshot && !loadError ? <p role="status">Cargando conversaciones…</p> : null}
      {loadError ? <p role="alert">No pudimos cargar las conversaciones.</p> : null}
      {snapshot && rows.length === 0 ? <p>No hay conversaciones que coincidan con los filtros.</p> : null}
      {rows.length > 0 ? <div className={styles.tableWrap}><table><thead><tr><th>Conversación</th><th>Proyecto</th><th>Estado</th><th>Actualizada</th></tr></thead><tbody>{rows.map((conversation) => {
        const projectName = snapshot?.projects.find(({ id }) => id === conversation.projectId)?.name ?? 'Sin proyecto'
        return <tr key={conversation.id}><td><Link to={`/conversations/${conversation.id}`}>{conversation.title}</Link><small>{conversation.preview}</small></td><td>{projectName}</td><td><span data-status={conversation.executionStatus}>{labels[conversation.executionStatus]}</span></td><td><time dateTime={conversation.updatedAt}>{dateFormatter.format(new Date(conversation.updatedAt))}</time></td></tr>
      })}</tbody></table></div> : null}
    </section>
  )
}
