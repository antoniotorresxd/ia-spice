import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ActivityTimeline } from '../../home/components/ActivityTimeline'
import type { ConversationExecution } from '../../home/model/home-types'
import type { WorkspaceConversationDetail, WorkspaceSnapshot } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import styles from './ConversationScreen.module.css'

const statusLabels = { active: 'En curso', completed: 'Completada', failed: 'Fallida' } as const

export function ConversationScreen({ service }: { service: WorkspaceService }) {
  const { conversationId = '' } = useParams()
  const [conversation, setConversation] = useState<WorkspaceConversationDetail | null>(null)
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [text, setText] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let current = true
    Promise.all([service.getConversation(conversationId), service.getSnapshot()]).then(
      ([detail, nextSnapshot]) => { if (current) { setConversation(detail); setSnapshot(nextSnapshot) } },
      () => { if (current) setLoadError(true) },
    )
    return () => { current = false }
  }, [conversationId, service])

  const timeline = useMemo<ConversationExecution | null>(() => conversation ? ({
    id: conversation.execution.id,
    projectId: conversation.projectId,
    conversation: { id: conversation.id, title: conversation.title, projectId: conversation.projectId, isTemporary: conversation.projectId === null, updatedAt: conversation.updatedAt },
    status: conversation.execution.status,
    stages: [{ id: `${conversation.execution.id}-interpretation`, kind: 'interpretation', label: 'Interpretación', actor: 'Agente', status: conversation.execution.status, durationMs: null, summary: conversation.execution.summary, metrics: [{ label: 'Mensajes', value: String(conversation.messages.length) }, { label: 'Archivos', value: String(conversation.files.length) }] }],
    files: conversation.files.map((file) => ({ id: file.id, name: file.name, kind: file.language === 'pdf' ? 'report' : file.language === 'spice' ? 'netlist' : 'data', partial: file.status === 'partial' })),
  }) : null, [conversation])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const nextText = text.trim()
    if (!nextText) { setSubmitError('Escribe una indicación antes de continuar.'); return }
    setPending(true)
    setSubmitError('')
    try {
      setConversation(await service.continueConversation(conversationId, nextText))
      setText('')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'No pudimos continuar la conversación.')
    } finally {
      setPending(false)
    }
  }

  if (loadError) return <section className={styles.state}><h1>No encontramos esta conversación</h1><p role="alert">No encontramos esta conversación. Puede que ya no exista.</p><Link to="/conversations">Volver a conversaciones</Link></section>
  if (!conversation || !timeline) return <p aria-live="polite">Cargando conversación…</p>
  const project = snapshot?.projects.find(({ id }) => id === conversation.projectId)

  return (
    <article className={styles.screen}>
      <nav aria-label="Ruta de conversación" className={styles.breadcrumb}><Link to="/conversations">Conversaciones</Link><span aria-hidden="true">/</span>{project ? <Link to={`/projects/${project.id}`}>{project.name}</Link> : <span>Sin proyecto</span>}</nav>
      <header className={styles.hero}><p className={styles.eyebrow}>Conversación</p><h1>{conversation.title}</h1><p>{conversation.preview}</p></header>
      <dl aria-label="Métricas de la conversación" className={styles.metrics}><div><dt>Estado</dt><dd>{statusLabels[conversation.executionStatus]}</dd></div><div><dt>Mensajes</dt><dd>{conversation.messages.length}</dd></div><div><dt>Archivos</dt><dd>{conversation.files.length}</dd></div></dl>
      <section aria-labelledby="messages-title" className={styles.messages}><h2 id="messages-title">Mensajes</h2>{conversation.messages.map((message) => <article className={styles.message} data-role={message.role} key={message.id}><p className={styles.role}>{message.role === 'user' ? 'Tú' : 'Asistente'}</p><p>{message.content}</p></article>)}</section>
      <ActivityTimeline execution={timeline} />
      <form className={styles.composer} onSubmit={(event) => void submit(event)}><label htmlFor="continuation">Nueva indicación</label><textarea disabled={pending} id="continuation" onChange={(event) => setText(event.target.value)} placeholder="Describe el siguiente ajuste…" value={text} />{submitError ? <p role="alert">{submitError}</p> : null}<button disabled={pending} type="submit">{pending ? 'Continuando…' : 'Continuar conversación'}</button></form>
    </article>
  )
}
