import { ArrowDown, ArrowUpRight, ChevronDown, ChevronUp, Cpu, Send, Trash2 } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'

import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { ActivityTimeline } from '../../home/components/ActivityTimeline'
import type { ConversationExecution } from '../../home/model/home-types'
import { useConversationPolling } from '../model/use-conversation-polling'
import type { WorkspaceConversationDetail, WorkspaceSnapshot } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import styles from './ConversationScreen.module.css'
import { NetlistDiagram } from './NetlistDiagram'

const statusLabels = { active: 'En curso', completed: 'Completada', failed: 'Fallida' } as const

export function ConversationScreen({ service }: { service: WorkspaceService }) {
  const { conversationId = '' } = useParams()
  const navigate = useNavigate()
  const outlet = useOutletContext<{ deleteConversation?: (id: string) => Promise<void> } | null>()
  const [conversation, setConversation] = useState<WorkspaceConversationDetail | null>(null)
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [text, setText] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [pending, setPending] = useState(false)
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)

  const messagesRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const [scrolledDown, setScrolledDown] = useState(false)
  const [awayFromLatest, setAwayFromLatest] = useState(false)

  const updateScroll = useCallback(() => {
    const region = messagesRef.current
    if (!region) return
    const away = region.scrollHeight - region.clientHeight - region.scrollTop > 64
    followLatest.current = !away
    setScrolledDown(region.scrollTop > 8)
    setAwayFromLatest(away)
  }, [])

  function scrollToLatest() {
    const region = messagesRef.current
    if (!region) return
    region.scrollTop = region.scrollHeight
    updateScroll()
  }

  useEffect(() => {
    const region = messagesRef.current
    const content = contentRef.current
    if (!region || !content) return
    const syncScroll = () => {
      if (followLatest.current) region.scrollTop = region.scrollHeight
      updateScroll()
    }
    syncScroll()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncScroll)
    observer?.observe(region)
    observer?.observe(content)
    return () => observer?.disconnect()
  }, [conversation, updateScroll])

  useEffect(() => {
    let current = true
    Promise.all([service.getConversation(conversationId), service.getSnapshot()]).then(
      ([detail, nextSnapshot]) => { if (current) { setConversation(detail); setSnapshot(nextSnapshot) } },
      () => { if (current) setLoadError(true) },
    )
    return () => { current = false }
  }, [conversationId, service])

  // useCallback es obligatorio: sin identidad estable, el efecto del hook
  // reinicia el intervalo en cada render y el sondeo nunca dispara.
  const refresh = useCallback(async () => {
    try {
      setConversation(await service.getConversation(conversationId))
    } catch {
      // Un fallo puntual de red no debe tumbar la pantalla ya cargada: el
      // siguiente ciclo del sondeo lo reintenta.
    }
  }, [conversationId, service])

  useConversationPolling(conversation?.executionStatus ?? null, refresh)

  const timeline = useMemo<ConversationExecution | null>(() => conversation ? ({
    id: conversation.execution.id,
    projectId: conversation.projectId,
    conversation: { id: conversation.id, title: conversation.title, projectId: conversation.projectId, isTemporary: conversation.projectId === null, updatedAt: conversation.updatedAt },
    status: conversation.execution.status,
    stages: [{ id: `${conversation.execution.id}-interpretation`, kind: 'interpretation', label: 'Interpretación', actor: 'Agente', status: conversation.execution.status, durationMs: null, summary: conversation.execution.summary, metrics: [{ label: 'Mensajes', value: String(conversation.messages.length) }, { label: 'Archivos', value: String(conversation.files.length) }] }],
    files: conversation.files.map((file) => ({ id: file.id, name: file.name, kind: file.language === 'pdf' ? 'report' : file.language === 'spice' ? 'netlist' : 'data', partial: file.status === 'partial' })),
  }) : null, [conversation])

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete() {
    if (!conversation) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      if (outlet?.deleteConversation) {
        await outlet.deleteConversation(conversation.id)
      } else {
        await service.deleteConversation(conversation.id)
        navigate('/conversations')
      }
      setIsConfirmingDelete(false)
    } catch {
      setDeleteError('No se pudo eliminar la conversación. Inténtalo de nuevo.')
      setIsDeleting(false)
    }
  }

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

  if (loadError) return <section className={`${styles.state} ${styles.detailState}`}><h1>No encontramos esta conversación</h1><p role="alert">No encontramos esta conversación. Puede que ya no exista.</p><Link to="/conversations">Volver a conversaciones</Link></section>
  if (!conversation || !timeline) return <p aria-live="polite">Cargando conversación…</p>
  const project = snapshot?.projects.find(({ id }) => id === conversation.projectId)
  const netlistFiles = conversation.files.filter((file) => file.language === 'spice' && file.content.trim())

  return (
    <article className={styles.screen}>
      <div className={styles.topNavRow}>
        <nav aria-label="Ruta de conversación" className={styles.breadcrumb}>
          <Link to="/conversations">Conversaciones</Link>
          <span aria-hidden="true">/</span>
          {project ? <Link to={`/projects/${project.id}`}>{project.name}</Link> : <span>Sin proyecto</span>}
        </nav>
        <button
          type="button"
          className={styles.deleteConversationBtn}
          onClick={() => {
            setDeleteError(null)
            setIsConfirmingDelete(true)
          }}
          aria-label="Eliminar conversación"
          title="Eliminar conversación"
        >
          <Trash2 size={15} />
          <span>Eliminar conversación</span>
        </button>
      </div>
      <header className={styles.hero}>
        <div className={styles.heroHeader}>
          <div>
            <p className={styles.eyebrow}>Conversación</p>
            <h1>{conversation.title}</h1>
          </div>
          <span className={styles.statusBadge} data-status={conversation.executionStatus}>
            {statusLabels[conversation.executionStatus]}
          </span>
        </div>
        <p>{conversation.preview}</p>
      </header>
      <dl aria-label="Métricas de la conversación" className={styles.metrics}><div><dt>Estado</dt><dd>{statusLabels[conversation.executionStatus]}</dd></div><div><dt>Mensajes</dt><dd>{conversation.messages.length}</dd></div><div><dt>Archivos</dt><dd>{conversation.files.length}</dd></div></dl>
      <div className={styles.messageViewport}>
        <div className={styles.messages} ref={messagesRef} onScroll={updateScroll} data-scrolled={scrolledDown} role="region" aria-label="Historial de conversación" tabIndex={0}>
          <div className={styles.messageContent} ref={contentRef}>
            <section aria-labelledby="messages-title" className={styles.messageList}>
              <h2 id="messages-title">Mensajes</h2>
              {conversation.messages.map((message) => (
                <article className={styles.message} data-role={message.role} key={message.id}>
                  <p className={styles.role}>{message.role === 'user' ? 'Tú' : 'Asistente'}</p>
                  <p>{message.content}</p>
                </article>
              ))}
            </section>
            <ActivityTimeline execution={timeline} heading="Progreso de la ejecución" />
            {netlistFiles.length ? (
              <section aria-labelledby="circuits-title" className={styles.circuits}>
                <h2 id="circuits-title">Circuitos generados</h2>
                {netlistFiles.map((file) => {
                  const isExpanded = previewFileId === file.id
                  return (
                    <div key={file.id} className={styles.circuitCard}>
                      <div className={styles.circuitCardHeader}>
                        <div className={styles.circuitCardMeta}>
                          <div className={styles.circuitCardIcon}>
                            <Cpu size={18} />
                          </div>
                          <div className={styles.circuitCardDetails}>
                            <span className={styles.circuitCardName}>{file.name}</span>
                            <span className={styles.circuitCardBadge}>Netlist SPICE</span>
                          </div>
                        </div>
                        <div className={styles.circuitCardActions}>
                          <button
                            type="button"
                            className={styles.circuitPreviewBtn}
                            onClick={() => setPreviewFileId(isExpanded ? null : file.id)}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            <span>{isExpanded ? 'Ocultar esquema' : 'Vista previa'}</span>
                          </button>
                          <Link
                            to={`/visualizer?conversationId=${conversation.id}&fileId=${file.id}`}
                            className={styles.circuitOpenBtn}
                            title="Abrir en pantalla completa en el visualizador"
                          >
                            <span>Abrir en Visualizador</span>
                            <ArrowUpRight size={13} />
                          </Link>
                        </div>
                      </div>
                      {isExpanded ? (
                        <NetlistDiagram netlistText={file.content} title={file.name} />
                      ) : null}
                    </div>
                  )
                })}
              </section>
            ) : null}
          </div>
        </div>
        {awayFromLatest ? (
          <button className={styles.scrollLatest} type="button" onClick={scrollToLatest}>
            <ArrowDown aria-hidden="true" size={16} />Ir al final
          </button>
        ) : null}
      </div>
      <form className={styles.composerDock} onSubmit={(event) => void submit(event)}>
        {submitError ? <p id="continuation-error" role="alert">{submitError}</p> : null}
        <div className={styles.composer}>
          <label className={styles.visuallyHidden} htmlFor="continuation">Nueva indicación</label>
          <textarea disabled={pending} id="continuation" rows={1} aria-describedby={submitError ? 'continuation-error' : undefined} onChange={(event) => setText(event.target.value)} placeholder="Describe el siguiente ajuste…" value={text} />
          <button disabled={pending} type="submit" aria-label={pending ? 'Continuando…' : 'Continuar conversación'}>
            <span className={styles.sendLabel}>{pending ? 'Continuando…' : 'Continuar conversación'}</span>
            <Send aria-hidden="true" size={18} />
          </button>
        </div>
      </form>
      <ConfirmDeleteModal
        isOpen={isConfirmingDelete}
        title={`¿Eliminar conversación "${conversation.title}"?`}
        description={deleteError || 'Esta acción no se puede deshacer y se eliminarán sus ejecuciones asociadas.'}
        confirmLabel="Eliminar conversación"
        isLoading={isDeleting}
        onCancel={() => {
          setIsConfirmingDelete(false)
          setDeleteError(null)
        }}
        onConfirm={() => void handleDelete()}
      />
    </article>
  )
}
