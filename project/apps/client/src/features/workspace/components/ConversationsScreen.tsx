import { useEffect, useMemo, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Link, useOutletContext } from 'react-router-dom'

import type { WorkspaceSnapshot } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import styles from './ConversationScreen.module.css'

const labels = { active: 'En curso', completed: 'Completada', failed: 'Fallida' } as const
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim()
const dateFormatter = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

export function ConversationsScreen({ service }: { service: WorkspaceService }) {
  const outlet = useOutletContext<{ refreshSnapshot?: () => Promise<void>; deleteConversation?: (id: string) => Promise<void> } | null>()
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

  const [conversationPendingDelete, setConversationPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const confirmDelete = async () => {
    if (!conversationPendingDelete) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      if (outlet?.deleteConversation) {
        await outlet.deleteConversation(conversationPendingDelete.id)
      } else {
        await service.deleteConversation(conversationPendingDelete.id)
      }
      const next = await service.getSnapshot()
      setSnapshot(next)
      setConversationPendingDelete(null)
    } catch {
      setDeleteError('No se pudo eliminar la conversación. Inténtalo de nuevo.')
    } finally {
      setIsDeleting(false)
    }
  }

  const rows = useMemo(() => {
    const term = normalize(query)
    return (snapshot?.conversations ?? []).filter((conversation) => {
      const projectName = snapshot?.projects.find(({ id }) => id === conversation.projectId)?.name ?? 'Sin proyecto'
      const matchesText = normalize(`${conversation.title} ${conversation.preview} ${projectName}`).includes(term)
      const matchesProject = project === 'all' || (project === 'unassigned' ? conversation.projectId === null : conversation.projectId === project)
      return matchesText && matchesProject && (status === 'all' || conversation.executionStatus === status)
    })
  }, [project, query, snapshot, status])

  const activeFilters = [
    ...(project !== 'all' ? [{
      key: 'project',
      label: `Proyecto: ${project === 'unassigned' ? 'Sin proyecto' : snapshot?.projects.find(({ id }) => id === project)?.name ?? project}`,
      clear: () => setProject('all'),
    }] : []),
    ...(status !== 'all' ? [{
      key: 'status',
      label: `Estado: ${labels[status as keyof typeof labels]}`,
      clear: () => setStatus('all'),
    }] : []),
    ...(query.trim() ? [{ key: 'query', label: `Búsqueda: ${query.trim()}`, clear: () => setQuery('') }] : []),
  ]

  return (
    <section aria-labelledby="conversations-title" className={styles.directory}>
      <header><p className={styles.eyebrow}>Workspace</p><h1 id="conversations-title">Conversaciones</h1><p>Consulta solicitudes y ejecuciones de todos tus proyectos.</p></header>
      <div className={styles.filters}>
        <label>Buscar conversaciones<input aria-label="Buscar conversaciones" onChange={(event) => setQuery(event.target.value)} placeholder="Título, solicitud o proyecto…" type="search" value={query} /></label>
        <label>Proyecto<select aria-label="Proyecto" onChange={(event) => setProject(event.target.value)} value={project}><option value="all">Todos</option><option value="unassigned">Sin proyecto</option>{snapshot?.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Estado<select aria-label="Estado" onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">Todos</option><option value="active">En curso</option><option value="completed">Completadas</option><option value="failed">Fallidas</option></select></label>
        <div className={styles.filterSummary}>
          <div className={styles.filterChips}>
            {activeFilters.map((filter) => (
              <Badge className={styles.filterChip} key={filter.key}>
                <span>{filter.label}</span>
                <button aria-label={`Quitar filtro ${filter.label}`} onClick={filter.clear} type="button">
                  <X aria-hidden="true" size={14} />
                </button>
              </Badge>
            ))}
          </div>
          <div className={styles.filterActions}>
            <span aria-live="polite">{activeFilters.length} {activeFilters.length === 1 ? 'filtro activo' : 'filtros activos'}</span>
            <button disabled={project === 'all' && status === 'all' && query === ''} onClick={() => { setProject('all'); setStatus('all'); setQuery('') }} type="button">Limpiar todo</button>
          </div>
        </div>
      </div>
      {!snapshot && !loadError ? <p role="status">Cargando conversaciones…</p> : null}
      {loadError ? <p role="alert">No pudimos cargar las conversaciones.</p> : null}
      {snapshot && rows.length === 0 ? <p>No hay conversaciones que coincidan con los filtros.</p> : null}
      {rows.length > 0 ? <div className={styles.tableWrap}><table><thead><tr><th>Conversación</th><th>Proyecto</th><th>Estado</th><th>Actualizada</th><th>Acciones</th></tr></thead><tbody>{rows.map((conversation) => {
        const projectName = snapshot?.projects.find(({ id }) => id === conversation.projectId)?.name ?? 'Sin proyecto'
        return (
          <tr key={conversation.id}>
            <td>
              <Link to={`/conversations/${conversation.id}`}>{conversation.title}</Link>
              <small>{conversation.preview}</small>
            </td>
            <td>{projectName}</td>
            <td>
              <span className={styles.statusPill} data-status={conversation.executionStatus}>
                <span className={styles.statusDot} />
                {labels[conversation.executionStatus]}
              </span>
            </td>
            <td><time dateTime={conversation.updatedAt}>{dateFormatter.format(new Date(conversation.updatedAt))}</time></td>
            <td>
              <div className={styles.rowActions}>
                <Link to={`/conversations/${conversation.id}`} className={styles.rowActionBtn} title="Abrir conversación">
                  Abrir
                </Link>
                <button
                  type="button"
                  className={styles.rowDeleteBtn}
                  onClick={() => {
                    setDeleteError(null)
                    setConversationPendingDelete({ id: conversation.id, title: conversation.title })
                  }}
                  aria-label={`Eliminar conversación ${conversation.title}`}
                  title="Eliminar conversación"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </td>
          </tr>
        )
      })}</tbody></table></div> : null}
      <ConfirmDeleteModal
        isOpen={conversationPendingDelete !== null}
        title={`¿Eliminar conversación "${conversationPendingDelete?.title ?? ''}"?`}
        description={deleteError || 'Esta acción no se puede deshacer y se eliminarán sus ejecuciones asociadas.'}
        confirmLabel="Eliminar conversación"
        isLoading={isDeleting}
        onCancel={() => {
          setConversationPendingDelete(null)
          setDeleteError(null)
        }}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  )
}
