import { useCallback, useEffect, useState } from 'react'
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

async function getProjectData(service: WorkspaceService, projectId: string) {
  const project = await service.getProject(projectId)
  const details = await Promise.all(project.conversations.map(({ id }) => service.getConversation(id)))
  return { project, details }
}

export function ProjectScreen({ service }: { service: WorkspaceService }) {
  const { projectId = '' } = useParams()
  const outlet = useOutletContext<{ refreshSnapshot?: () => Promise<void> } | null>()
  const [project, setProject] = useState<WorkspaceProjectDetail | null>(null)
  const [details, setDetails] = useState<WorkspaceConversationDetail[]>([])
  const [tab, setTab] = useState<'conversations' | 'files'>('conversations')
  const [assignment, setAssignment] = useState<AssignmentState>({ status: 'idle' })
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    const next = await getProjectData(service, projectId)
    setProject(next.project)
    setDetails(next.details)
  }, [projectId, service])

  useEffect(() => {
    let current = true
    getProjectData(service, projectId).then(
      (next) => { if (current) { setProject(next.project); setDetails(next.details) } },
      () => { if (current) setLoadError(true) },
    )
    return () => { current = false }
  }, [projectId, service])

  const assign = async ({ conversationId, previousProjectId }: ConversationDragPayload) => {
    setAssignment({ status: 'saving', conversationId, projectId })
    try {
      await service.assignConversation(conversationId, projectId)
      setAssignment({ status: 'saved', conversationId, previousProjectId, projectId })
      await load()
      await outlet?.refreshSnapshot?.()
    } catch (error) {
      setAssignment({ status: 'error', conversationId, message: error instanceof Error ? error.message : 'No pudimos mover la conversación.' })
    }
  }

  const undo = async () => {
    if (assignment.status !== 'saved') return
    const { conversationId, previousProjectId } = assignment
    try {
      await service.restoreConversationProject(conversationId, previousProjectId)
      setAssignment({ status: 'idle' })
      await load()
      await outlet?.refreshSnapshot?.()
    } catch (error) {
      setAssignment({ status: 'error', conversationId, message: error instanceof Error ? error.message : 'No pudimos deshacer el movimiento.' })
    }
  }

  if (loadError) return <p role="alert">No pudimos cargar el proyecto.</p>
  if (!project) return <p aria-live="polite">Cargando proyecto…</p>
  const files = details.flatMap((conversation) => conversation.files.map((file) => ({ file, conversation })))

  return (
    <ConversationDropTarget onAssign={(payload) => void assign(payload)} projectName={project.name}>
      <header className={styles.header}><p>Proyecto</p><h1>{project.name}</h1><p>{project.description}</p></header>
      <div aria-label="Contenido del proyecto" className={styles.tabs} role="tablist">
        <button aria-controls="project-conversations" aria-selected={tab === 'conversations'} onClick={() => setTab('conversations')} role="tab" type="button">Conversaciones {project.conversations.length}</button>
        <button aria-controls="project-files" aria-selected={tab === 'files'} onClick={() => setTab('files')} role="tab" type="button">Archivos {project.fileCount}</button>
      </div>
      {tab === 'conversations' ? <section aria-label="Conversaciones" id="project-conversations" role="tabpanel"><ul className={styles.list}>{project.conversations.map((conversation) => <li key={conversation.id}><Link to={`/conversations/${conversation.id}`}>{conversation.title}</Link><p>{conversation.preview}</p></li>)}</ul>{project.conversations.length === 0 ? <p>Este proyecto todavía no tiene conversaciones.</p> : null}</section> : null}
      {tab === 'files' ? <section aria-label="Archivos" id="project-files" role="tabpanel"><ul className={styles.list}>{files.map(({ file, conversation }) => <li key={file.id}><Link to={`/conversations/${conversation.id}`}>{file.name}</Link><span>{conversation.title}</span></li>)}</ul>{files.length === 0 ? <p>Este proyecto todavía no tiene archivos.</p> : null}</section> : null}
      {assignment.status === 'saving' ? <p aria-live="polite">Moviendo conversación…</p> : null}
      {assignment.status === 'saved' ? <div aria-live="polite" role="status">Conversación movida a {project.name} <button onClick={() => void undo()} type="button">Deshacer</button></div> : null}
      {assignment.status === 'error' ? <p role="alert">{assignment.message}</p> : null}
    </ConversationDropTarget>
  )
}
