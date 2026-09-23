import {
  ArrowDown,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'

import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { ConversationDetailSkeleton } from '@/components/ui/Skeleton'
import { ActivityTimeline } from '../../home/components/ActivityTimeline'
import type { ConversationExecution, ExecutionStage } from '../../home/model/home-types'
import { useConversationPolling } from '../model/use-conversation-polling'
import type { WorkspaceConversationDetail, WorkspaceSnapshot } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import { RenameConversationDialog } from './RenameConversationDialog'
import styles from './ConversationScreen.module.css'
import { NetlistDiagram } from './NetlistDiagram'

const statusLabels = { active: 'En curso', completed: 'Completada', failed: 'Fallida' } as const

export function ConversationScreen({ service }: { service: WorkspaceService }) {
  const { conversationId = '' } = useParams()
  const navigate = useNavigate()
  const outlet = useOutletContext<{ refreshSnapshot?: () => Promise<void>; deleteConversation?: (id: string) => Promise<void> } | null>()
  const [conversation, setConversation] = useState<WorkspaceConversationDetail | null>(null)
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [text, setText] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [pending, setPending] = useState(false)
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)

  const messagesRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const followLatest = useRef(true)
  const [scrolledDown, setScrolledDown] = useState(false)
  const [awayFromLatest, setAwayFromLatest] = useState(false)

  const updateScroll = useCallback(() => {
    const region = messagesRef.current
    if (!region) return
    const distanceToBottom = region.scrollHeight - region.scrollTop - region.clientHeight
    const away = distanceToBottom >= 32
    followLatest.current = !away
    setScrolledDown(region.scrollTop > 8)
    setAwayFromLatest(away)
  }, [])

  function scrollToBottom() {
    const region = messagesRef.current
    if (!region) return
    region.scrollTop = region.scrollHeight
    followLatest.current = true
    updateScroll()
  }
  const scrollToLatest = scrollToBottom

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

  const refresh = useCallback(async () => {
    try {
      setConversation(await service.getConversation(conversationId, { bypassCache: true }))
    } catch {
      // Ignorar fallo puntual
    }
  }, [conversationId, service])

  useConversationPolling(conversation?.executionStatus ?? null, refresh)

  useEffect(() => {
    if (!service.subscribeConversationEvents || conversation?.executionStatus !== 'active') {
      return
    }

    const unsubscribe = service.subscribeConversationEvents(conversationId, (event) => {
      if (event.type === 'stage') {
        const stage = event.data as ExecutionStage
        setConversation((prev) => {
          if (!prev || prev.id !== conversationId) return prev
          const existingStages = prev.execution.stages ? [...prev.execution.stages] : []
          const index = existingStages.findIndex((s) => s.kind === stage.kind)
          if (index >= 0) {
            existingStages[index] = { ...existingStages[index], ...stage }
          } else {
            existingStages.push(stage)
          }
          return {
            ...prev,
            execution: {
              ...prev.execution,
              summary: stage.summary,
              stages: existingStages,
            },
          }
        })
      } else if (event.type === 'done' || event.type === 'error') {
        void refresh()
      }
    })

    return unsubscribe
  }, [conversation?.executionStatus, conversationId, refresh, service])

  const netlistFiles = useMemo(
    () => conversation?.files.filter((file) => file.language === 'spice' && file.content.trim()) ?? [],
    [conversation?.files],
  )

  const isDesignExecution = useMemo(() => {
    if (!conversation) return false
    if (conversation.execution.mode === 'chat' || conversation.execution.mode === 'clarify') return false
    if (conversation.execution.mode === 'design') return true
    return (
      conversation.files.length > 0 ||
      Boolean(conversation.execution.stages && conversation.execution.stages.length > 0) ||
      conversation.execution.status === 'active'
    )
  }, [conversation])

  const hasCircuitsOrDesign = netlistFiles.length > 0 || isDesignExecution
  const [sidePanelUserToggled, setSidePanelUserToggled] = useState<boolean | null>(null)
  const isSidePanelOpen = sidePanelUserToggled ?? hasCircuitsOrDesign

  const timeline = useMemo<ConversationExecution | null>(() => {
    if (!conversation) return null

    const stages =
      conversation.execution.stages && conversation.execution.stages.length > 0
        ? conversation.execution.stages
        : (isDesignExecution
            ? [
                {
                  id: `${conversation.execution.id}-interpretation`,
                  kind: 'interpretation' as const,
                  label: 'Interpretación',
                  actor: 'Orquestador',
                  status: conversation.execution.status,
                  durationMs: null,
                  summary: conversation.execution.summary,
                  metrics: [
                    { label: 'Mensajes', value: String(conversation.messages.length) },
                    { label: 'Archivos', value: String(conversation.files.length) },
                  ],
                },
              ]
            : [])

    return {
      id: conversation.execution.id,
      projectId: conversation.projectId,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        projectId: conversation.projectId,
        isTemporary: conversation.projectId === null,
        updatedAt: conversation.updatedAt,
      },
      status: conversation.execution.status,
      stages,
      files: conversation.files.map((file) => ({
        id: file.id,
        name: file.name,
        kind: file.language === 'pdf' ? 'report' : file.language === 'spice' ? 'netlist' : 'data',
        partial: file.status === 'partial',
      })),
    }
  }, [conversation, isDesignExecution])

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
  if (!conversation || !timeline) return <ConversationDetailSkeleton />
  const project = snapshot?.projects.find(({ id }) => id === conversation.projectId)

  return (
    <article className={styles.screen}>
      <header className={styles.topNavRow}>
        <div className={styles.headerLeft}>
          <nav aria-label="Ruta de conversación" className={styles.breadcrumb}>
            <Link to="/conversations">Conversaciones</Link>
            <span aria-hidden="true" className={styles.breadcrumbSep}>/</span>
            {project ? <Link to={`/projects/${project.id}`}>{project.name}</Link> : <span>Sin proyecto</span>}
          </nav>
          <div className={styles.titleDivider} aria-hidden="true">|</div>
          <div className={styles.headerTitleWrap}>
            <h1 className={styles.conversationTitle}>{conversation.title}</h1>
            <span className={styles.statusBadge} data-status={conversation.executionStatus}>
              {isDesignExecution
                ? statusLabels[conversation.executionStatus]
                : (conversation.executionStatus === 'active' ? 'Pensando…' : 'Conversación')}
            </span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.editConversationBtn}
            onClick={() => setIsRenaming(true)}
            aria-label={`Renombrar conversación ${conversation.title}`}
            title="Renombrar conversación"
          >
            <Pencil size={14} />
            <span>Renombrar</span>
          </button>
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
            <Trash2 size={14} />
            <span>Eliminar conversación</span>
          </button>
          <button
            type="button"
            className={`${styles.panelToggleBtn} ${isSidePanelOpen ? styles.panelToggleActive : ''}`}
            onClick={() => setSidePanelUserToggled(!isSidePanelOpen)}
            aria-expanded={isSidePanelOpen}
            aria-label={isSidePanelOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
            title={isSidePanelOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
          >
            <Cpu size={15} />
            <span>{netlistFiles.length > 0 ? `Circuito (${netlistFiles.length})` : 'Inspección'}</span>
            {isSidePanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          </button>
        </div>
      </header>

      <div className={styles.workspaceBody}>
        <div className={styles.chatColumn}>
          <div className={styles.messageViewport}>
            <div className={styles.messages} ref={messagesRef} onScroll={updateScroll} data-scrolled={scrolledDown} role="region" aria-label="Historial de conversación" tabIndex={0}>
              <div className={styles.messageContent} ref={contentRef}>
                <section aria-labelledby="messages-title" className={styles.messageList}>
                  <h2 id="messages-title" className={styles.visuallyHidden}>Mensajes</h2>
                  {conversation.messages.map((message) => (
                    <article className={styles.message} data-role={message.role} key={message.id}>
                      <p className={styles.role}>{message.role === 'user' ? 'Tú' : 'Asistente'}</p>
                      <p>{message.content}</p>
                    </article>
                  ))}
                  {(pending || conversation.executionStatus === 'active') && (
                    <article className={styles.message} data-role="assistant" aria-live="polite">
                      <p className={styles.role}>Asistente</p>
                      <p>{conversation.execution.summary || 'Pensando…'}</p>
                      {isDesignExecution && !isSidePanelOpen && (
                        <div className={styles.activeExecutionNotice}>
                          <span>Simulando circuito en segundo plano…</span>
                          <button
                            type="button"
                            className={styles.openPanelInlineBtn}
                            onClick={() => setSidePanelUserToggled(true)}
                          >
                            Ver etapas en panel lateral →
                          </button>
                        </div>
                      )}
                    </article>
                  )}
                </section>

                {netlistFiles.length > 0 && !isSidePanelOpen && (
                  <div className={styles.circuitQuickBanner}>
                    <div className={styles.circuitQuickInfo}>
                      <Cpu size={16} />
                      <span>Circuito generado: <strong>{netlistFiles[0].name}</strong></span>
                    </div>
                    <div className={styles.circuitQuickActions}>
                      <button
                        type="button"
                        className={styles.quickBannerBtn}
                        onClick={() => setSidePanelUserToggled(true)}
                      >
                        Ver en panel lateral
                      </button>
                      <Link
                        to={`/visualizer?conversationId=${conversation.id}&fileId=${netlistFiles[0].id}`}
                        className={styles.quickBannerLink}
                      >
                        Visualizador <ArrowUpRight size={13} />
                      </Link>
                    </div>
                  </div>
                )}
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
        </div>

        {isSidePanelOpen && (
          <aside className={styles.lateralPanel} aria-label="Panel de inspección y circuitos">
            <div className={styles.lateralHeader}>
              <div className={styles.lateralTitle}>
                <Cpu size={16} />
                <h2>Inspección de Circuito</h2>
              </div>
              <button
                type="button"
                className={styles.lateralCloseBtn}
                onClick={() => setSidePanelUserToggled(false)}
                aria-label="Cerrar panel lateral"
                title="Cerrar panel lateral"
              >
                <X size={15} />
              </button>
            </div>

            <div className={styles.lateralContent}>
              <dl aria-label="Métricas de la conversación" className={styles.metrics}>
                <div>
                  <dt>Estado</dt>
                  <dd>{statusLabels[conversation.executionStatus]}</dd>
                </div>
                <div>
                  <dt>Mensajes</dt>
                  <dd>{conversation.messages.length}</dd>
                </div>
                <div>
                  <dt>Archivos</dt>
                  <dd>{conversation.files.length}</dd>
                </div>
              </dl>

              {conversation.preview && (
                <div className={styles.lateralPreviewCard}>
                  <span className={styles.lateralPreviewKicker}>Resumen de ejecución</span>
                  <p>{conversation.preview}</p>
                </div>
              )}

              {netlistFiles.length > 0 && (
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
              )}

              {isDesignExecution && timeline && timeline.stages.length > 0 && (
                <div className={styles.lateralTimelineSection}>
                  <ActivityTimeline execution={timeline} heading="Progreso de la ejecución" />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

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
      {isRenaming && (
        <RenameConversationDialog
          initialTitle={conversation.title}
          renameConversation={(title) => service.renameConversation(conversation.id, title)}
          onClose={() => setIsRenaming(false)}
          onRenamed={async (updated) => {
            setConversation(updated)
            setIsRenaming(false)
            await outlet?.refreshSnapshot?.()
          }}
        />
      )}
    </article>
  )
}
