import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'

import type { WorkspaceConversationDetail, WorkspaceProjectDetail } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import { ConversationDropTarget, type ConversationDragPayload } from './ConversationDropTarget'
import styles from './ProjectScreen.module.css'

type AssignmentState =
  | { status: 'idle' }
  | { status: 'saving'; conversationId: string; projectId: string }
  | { status: 'saved'; conversationId: string; previousProjectId: string | null; projectId: string }
  | { status: 'error'; conversationId: string; message: string }

export function ProjectScreen({ service }: { service: WorkspaceService }) {
  const { projectId = '' } = useParams()
  return <ProjectScreenContent key={projectId} projectId={projectId} service={service} />
}

function ProjectScreenContent({ projectId, service }: { projectId: string; service: WorkspaceService }) {
  const outlet = useOutletContext<{ refreshSnapshot?: () => Promise<void> } | null>()
  const [project, setProject] = useState<WorkspaceProjectDetail | null>(null)
  const [details, setDetails] = useState<WorkspaceConversationDetail[]>([])
  const [filesLoaded, setFilesLoaded] = useState(false)
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesPartial, setFilesPartial] = useState(false)
  const [tab, setTab] = useState<'conversations' | 'files'>('conversations')
  const [assignment, setAssignment] = useState<AssignmentState>({ status: 'idle' })
  const [loadError, setLoadError] = useState(false)
  const [refreshWarning, setRefreshWarning] = useState(false)
  const conversationTabRef = useRef<HTMLButtonElement>(null)
  const filesTabRef = useRef<HTMLButtonElement>(null)
  const conversationsTabId = `project-${projectId}-conversations-tab`
  const conversationsPanelId = `project-${projectId}-conversations-panel`
  const filesTabId = `project-${projectId}-files-tab`
  const filesPanelId = `project-${projectId}-files-panel`

  const loadProject = useCallback(async () => {
    const next = await service.getProject(projectId)
    setProject(next)
    return next
  }, [projectId, service])

  const loadFiles = useCallback(async (source: WorkspaceProjectDetail) => {
    setFilesLoading(true)
    const results = await Promise.allSettled(source.conversations.map(({ id }) => service.getConversation(id)))
    setDetails(results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []))
    setFilesPartial(results.some((result) => result.status === 'rejected'))
    setFilesLoaded(true)
    setFilesLoading(false)
  }, [service])

  useEffect(() => {
    let current = true
    service.getProject(projectId).then(
      (next) => { if (current) setProject(next) },
      () => { if (current) setLoadError(true) },
    )
    return () => { current = false }
  }, [projectId, service])

  const selectTab = (next: 'conversations' | 'files') => {
    setTab(next)
    if (next === 'files' && project && !filesLoaded && !filesLoading) void loadFiles(project)
  }

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = tab === 'conversations' ? 'files' : 'conversations'
    selectTab(next)
    ;(next === 'files' ? filesTabRef : conversationTabRef).current?.focus()
  }

  const refreshAfterMutation = async () => {
    const results = await Promise.allSettled([loadProject(), outlet?.refreshSnapshot?.() ?? Promise.resolve()])
    const nextProject = results[0].status === 'fulfilled' ? results[0].value : null
    if (tab === 'files' && nextProject) await loadFiles(nextProject)
    setRefreshWarning(results.some((result) => result.status === 'rejected'))
  }

  const assign = async ({ conversationId, previousProjectId }: ConversationDragPayload) => {
    setAssignment({ status: 'saving', conversationId, projectId })
    try {
      await service.assignConversation(conversationId, projectId)
    } catch (error) {
      setAssignment({ status: 'error', conversationId, message: error instanceof Error ? error.message : 'No pudimos mover la conversación.' })
      return
    }
    setAssignment({ status: 'saved', conversationId, previousProjectId, projectId })
    await refreshAfterMutation()
  }

  const undo = async () => {
    if (assignment.status !== 'saved') return
    const { conversationId, previousProjectId } = assignment
    try {
      await service.restoreConversationProject(conversationId, previousProjectId)
    } catch (error) {
      setAssignment({ status: 'error', conversationId, message: error instanceof Error ? error.message : 'No pudimos deshacer el movimiento.' })
      return
    }
    setAssignment({ status: 'idle' })
    await refreshAfterMutation()
  }

  const retryRefresh = async () => {
    setRefreshWarning(false)
    await refreshAfterMutation()
  }

  if (loadError) return <p role="alert">No pudimos cargar el proyecto.</p>
  if (!project) return <p aria-live="polite">Cargando proyecto…</p>
  const files = details.flatMap((conversation) => conversation.files.map((file) => ({ file, conversation })))

  return (
    <ConversationDropTarget onAssign={(payload) => void assign(payload)} projectName={project.name}>
      <header className={styles.header}><p>Proyecto</p><h1>{project.name}</h1><p>{project.description}</p></header>
      <div aria-label="Contenido del proyecto" className={styles.tabs} role="tablist">
        <button aria-controls={conversationsPanelId} aria-selected={tab === 'conversations'} id={conversationsTabId} onClick={() => selectTab('conversations')} onKeyDown={handleTabKey} ref={conversationTabRef} role="tab" tabIndex={tab === 'conversations' ? 0 : -1} type="button">Conversaciones {project.conversations.length}</button>
        <button aria-controls={filesPanelId} aria-selected={tab === 'files'} id={filesTabId} onClick={() => selectTab('files')} onKeyDown={handleTabKey} ref={filesTabRef} role="tab" tabIndex={tab === 'files' ? 0 : -1} type="button">Archivos {project.fileCount}</button>
      </div>
      {tab === 'conversations' ? <section aria-labelledby={conversationsTabId} id={conversationsPanelId} role="tabpanel"><ul className={styles.list}>{project.conversations.map((conversation) => <li key={conversation.id}><Link to={`/conversations/${conversation.id}`}>{conversation.title}</Link><p>{conversation.preview}</p></li>)}</ul>{project.conversations.length === 0 ? <p>Este proyecto todavía no tiene conversaciones.</p> : null}</section> : null}
      {tab === 'files' ? <section aria-labelledby={filesTabId} id={filesPanelId} role="tabpanel">{filesLoading ? <p aria-live="polite">Cargando archivos…</p> : <><ul className={styles.list}>{files.map(({ file, conversation }) => <li key={file.id}><Link to={`/conversations/${conversation.id}`}>{file.name}</Link><span>{conversation.title}</span></li>)}</ul>{filesLoaded && files.length === 0 ? <p>Este proyecto todavía no tiene archivos.</p> : null}</>}{filesPartial ? <p role="status">Algunos archivos no se pudieron cargar.</p> : null}</section> : null}
      {assignment.status === 'saving' ? <p aria-live="polite">Moviendo conversación…</p> : null}
      {assignment.status === 'saved' ? <div aria-live="polite" role="status">Conversación movida a {project.name} <button onClick={() => void undo()} type="button">Deshacer</button></div> : null}
      {assignment.status === 'error' ? <p role="alert">{assignment.message}</p> : null}
      {refreshWarning ? <p>La operación se guardó, pero no pudimos actualizar la vista. <button onClick={() => void retryRefresh()} type="button">Reintentar actualización</button></p> : null}
    </ConversationDropTarget>
  )
}
