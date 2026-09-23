import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  Bold,
  Check,
  ChevronDown,
  ChevronUp,
  Code,
  Copy,
  Cpu,
  Download,
  FileSearch,
  FolderGit2,
  Italic,
  Lightbulb,
  List,
  ListOrdered,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  RefreshCw,
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
import type { TraceResponse, WorkspaceConversationDetail, WorkspaceSnapshot } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import { RenameConversationDialog } from './RenameConversationDialog'
import styles from './ConversationScreen.module.css'
import { NetlistDiagram } from './NetlistDiagram'
import { SimulationChart } from './SimulationChart'

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
  const [simCurveFileId, setSimCurveFileId] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [copiedTraceId, setCopiedTraceId] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<'flow' | 'trace' | 'files'>('flow')
  const [traceData, setTraceData] = useState<TraceResponse | null>(null)
  const [isLoadingTrace, setIsLoadingTrace] = useState(false)
  const [expandedGenerations, setExpandedGenerations] = useState<Record<number, boolean>>({})

  function downloadNetlistFile(fileName: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.endsWith('.cir') ? fileName : `${fileName}.cir`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const followLatest = useRef(true)
  const [scrolledDown, setScrolledDown] = useState(false)
  const [awayFromLatest, setAwayFromLatest] = useState(false)

  const handleCopyTraceId = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopiedTraceId(true)
    setTimeout(() => setCopiedTraceId(false), 2000)
  }

  const insertFormat = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = text.slice(start, end)
    const replacement = `${prefix}${selected || 'texto'}${suffix}`
    const newText = text.slice(0, start) + replacement + text.slice(end)
    setText(newText)
    setTimeout(() => {
      textarea.focus()
      const cursorPos = start + prefix.length + (selected ? selected.length : 5)
      textarea.setSelectionRange(cursorPos, cursorPos)
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (isEditMode) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          void submit()
        }
      } else {
        if (!e.shiftKey) {
          e.preventDefault()
          void submit()
        }
      }
    }
  }

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

  const loadTrace = useCallback(async () => {
    if (!service.getTrace) return
    setIsLoadingTrace(true)
    try {
      const res = await service.getTrace(conversationId)
      setTraceData(res)
    } catch {
      setTraceData({ status: 'unavailable', message: 'No se pudo contactar el servicio de trazas' })
    } finally {
      setIsLoadingTrace(false)
    }
  }, [conversationId, service])

  useEffect(() => {
    if (inspectorTab === 'trace') {
      const timer = setTimeout(() => {
        void loadTrace()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [inspectorTab, loadTrace, conversation?.executionStatus])

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

  async function submit(event?: FormEvent) {
    event?.preventDefault()
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
                  {conversation.executionStatus === 'failed' &&
                    conversation.messages[conversation.messages.length - 1]?.role === 'user' && (
                      <article className={styles.message} data-role="assistant">
                        <p className={styles.role}>Asistente</p>
                        <p>
                          ⚠️ {conversation.execution.summary || 'No pudimos ejecutar el diseño. Inténtalo de nuevo.'}
                        </p>
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
            <div className={`${styles.composer} ${isEditMode ? styles.composerExpanded : ''}`}>
              {isEditMode && (
                <div className={styles.composerFormatBar} role="toolbar" aria-label="Herramientas de formato">
                  <button
                    type="button"
                    className={styles.formatBarBtn}
                    onClick={() => insertFormat('**', '**')}
                    title="Negrita (**texto**)"
                    aria-label="Negrita"
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.formatBarBtn}
                    onClick={() => insertFormat('*', '*')}
                    title="Cursiva (*texto*)"
                    aria-label="Cursiva"
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.formatBarBtn}
                    onClick={() => insertFormat('```spice\n', '\n```')}
                    title="Bloque de código SPICE"
                    aria-label="Código SPICE"
                  >
                    <Code size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.formatBarBtn}
                    onClick={() => insertFormat('- ')}
                    title="Lista con viñetas"
                    aria-label="Viñetas"
                  >
                    <List size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.formatBarBtn}
                    onClick={() => insertFormat('1. ')}
                    title="Lista numerada"
                    aria-label="Numeración"
                  >
                    <ListOrdered size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.formatBarBtn}
                    onClick={() => setText('')}
                    title="Limpiar texto"
                    aria-label="Limpiar texto"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}

              <label className={styles.visuallyHidden} htmlFor="continuation">Nueva indicación</label>
              <textarea
                ref={textareaRef}
                disabled={pending}
                id="continuation"
                rows={isEditMode ? 3 : 1}
                aria-describedby={submitError ? 'continuation-error' : undefined}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isEditMode ? "Escribe o edita el mensaje (Ctrl+Enter para enviar)…" : "Describe el siguiente ajuste (Enter para enviar)…"}
                value={text}
              />

              <div className={styles.composerFooter}>
                <span className={styles.composerHint}>
                  {isEditMode ? 'Enter = salto de línea · Ctrl+Enter = enviar' : 'Enter = enviar · Shift+Enter = salto de línea'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <button
                    type="button"
                    className={`${styles.formatToggleBtn} ${isEditMode ? styles.formatToggleBtnActive : ''}`}
                    onClick={() => setIsEditMode((prev) => !prev)}
                    title={isEditMode ? "Modo compacto (Enter para enviar)" : "Modo edición enriquecida (tipo Teams)"}
                    aria-label="Alternar modo edición"
                    aria-pressed={isEditMode}
                  >
                    <Pencil size={15} />
                  </button>
                  <button disabled={pending} type="submit" aria-label={pending ? 'Continuando…' : 'Continuar conversación'}>
                    <span className={styles.sendLabel}>{pending ? 'Continuando…' : 'Continuar conversación'}</span>
                    <Send aria-hidden="true" size={18} />
                  </button>
                </div>
              </div>
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

            {/* Subpestañas del Inspector */}
            <div className={styles.inspectorTabs} role="tablist" aria-label="Secciones del inspector">
              <button
                type="button"
                role="tab"
                aria-selected={inspectorTab === 'flow'}
                className={`${styles.inspectorTabBtn} ${inspectorTab === 'flow' ? styles.inspectorTabActive : ''}`}
                onClick={() => setInspectorTab('flow')}
              >
                <Activity size={14} />
                <span>Flujo</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inspectorTab === 'trace'}
                className={`${styles.inspectorTabBtn} ${inspectorTab === 'trace' ? styles.inspectorTabActive : ''}`}
                onClick={() => setInspectorTab('trace')}
              >
                <FileSearch size={14} />
                <span>Traza</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inspectorTab === 'files'}
                className={`${styles.inspectorTabBtn} ${inspectorTab === 'files' ? styles.inspectorTabActive : ''}`}
                onClick={() => setInspectorTab('files')}
              >
                <FolderGit2 size={14} />
                <span>Archivos {netlistFiles.length > 0 ? `(${netlistFiles.length})` : ''}</span>
              </button>
            </div>

            <div className={styles.lateralContent}>
              {inspectorTab === 'flow' && (
                <>
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

                  {isDesignExecution && timeline && timeline.stages.length > 0 ? (
                    <div className={styles.lateralTimelineSection}>
                      <ActivityTimeline execution={timeline} heading="Progreso de la ejecución" />
                    </div>
                  ) : (
                    <div className={styles.emptyTabState}>
                      <Activity size={24} style={{ opacity: 0.4 }} />
                      <p>No hay ejecución de diseño en curso para este diálogo.</p>
                    </div>
                  )}
                </>
              )}

              {inspectorTab === 'trace' && (
                <div className={styles.traceSection}>
                  {/* Diagnóstico técnico */}
                  {conversation.execution && (
                    <div
                      className={`${styles.lateralDiagnosticCard} ${
                        conversation.executionStatus === 'failed'
                          ? styles.lateralDiagnosticFailed
                          : conversation.executionStatus === 'completed'
                          ? styles.lateralDiagnosticSuccess
                          : ''
                      }`}
                    >
                      <span className={styles.lateralDiagnosticTitle}>
                        {conversation.executionStatus === 'failed'
                          ? '⚠️ Diagnóstico de Fallo'
                          : conversation.executionStatus === 'completed'
                          ? '✓ Resultado de Ejecución'
                          : '⏳ Estado de Ejecución'}
                      </span>
                      <p>{conversation.execution.summary || conversation.preview || 'Sin observaciones registradas.'}</p>
                    </div>
                  )}

                  {/* Sugerencia contextual de iteraciones */}
                  {conversation.executionStatus === 'failed' && (
                    <div className={styles.traceAdviceCard}>
                      <Lightbulb size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                      <div>
                        <strong>Sugerencia de convergencia:</strong>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.74rem' }}>
                          Si la simulación requiere más ciclos de ajuste en ngspice, puedes aumentar las iteraciones
                          máximas (hasta 10) o modificar la tolerancia en{' '}
                          <Link to="/settings" style={{ color: 'inherit', textDecoration: 'underline' }}>
                            Configuración → Parámetros del Curador
                          </Link>.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ID de ejecución para trazabilidad */}
                  {conversation.execution?.id && (
                    <div className={styles.lateralTraceCard}>
                      <div className={styles.lateralTraceHeader}>
                        <span>Identificador de Ejecución</span>
                      </div>
                      <div className={styles.lateralTraceIdRow}>
                        <span className={styles.lateralTraceId} title={conversation.execution.id}>
                          {conversation.execution.id}
                        </span>
                        <button
                          type="button"
                          className={styles.traceActionBtn}
                          onClick={() => handleCopyTraceId(conversation.execution.id)}
                          title="Copiar ID de corrida"
                        >
                          {copiedTraceId ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedTraceId ? 'Copiado' : 'Copiar'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Langfuse In-App Trace Tree */}
                  <div className={styles.langfuseTraceWrap}>
                    <div className={styles.langfuseHeaderCard}>
                      <div className={styles.langfuseMetaRow}>
                        <div className={styles.langfuseTitle}>
                          <Activity size={14} style={{ color: '#38bdf8' }} />
                          <span>Traza de Langfuse (In-App)</span>
                        </div>
                        <button
                          type="button"
                          className={styles.traceActionBtn}
                          onClick={() => void loadTrace()}
                          disabled={isLoadingTrace}
                          title="Actualizar traza de Langfuse"
                        >
                          <RefreshCw size={12} className={isLoadingTrace ? 'spin' : ''} />
                          <span>{isLoadingTrace ? 'Cargando...' : 'Actualizar'}</span>
                        </button>
                      </div>

                      {traceData?.status === 'ok' && traceData.trace ? (
                        <div className={styles.langfuseStats}>
                          {traceData.trace.total_tokens !== undefined && (
                            <span>Tokens: <strong className={styles.langfuseStatVal}>{traceData.trace.total_tokens.toLocaleString()}</strong></span>
                          )}
                          {traceData.trace.latency_s !== undefined && traceData.trace.latency_s !== null && (
                            <span>Latencia: <strong className={styles.langfuseStatVal}>{traceData.trace.latency_s.toFixed(2)}s</strong></span>
                          )}
                          <span>Generaciones: <strong className={styles.langfuseStatVal}>{traceData.trace.generations?.length ?? 0}</strong></span>
                        </div>
                      ) : traceData?.status === 'unavailable' ? (
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>
                          {traceData.message || 'La traza aún se está indexando en Langfuse Cloud. Presiona Actualizar en unos segundos.'}
                        </p>
                      ) : isLoadingTrace ? (
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>Consultando traza en Langfuse...</p>
                      ) : null}
                    </div>

                    {/* List of Generations */}
                    {traceData?.status === 'ok' && traceData.trace?.generations && traceData.trace.generations.length > 0 && (
                      <div className={styles.generationList}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginTop: '0.25rem' }}>
                          Llamadas a Modelos LLM ({traceData.trace.generations.length})
                        </span>
                        {traceData.trace.generations.map((gen, idx) => {
                          const isExpanded = Boolean(expandedGenerations[idx])
                          return (
                            <div key={`gen-${idx}`} className={styles.generationCard}>
                              <button
                                type="button"
                                className={styles.generationCardHeader}
                                onClick={() => setExpandedGenerations((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                              >
                                <div className={styles.generationTitleWrap}>
                                  <span className={styles.generationName}>{gen.name}</span>
                                  {gen.model && <span className={styles.generationModelBadge}>{gen.model}</span>}
                                </div>
                                <div className={styles.generationMeta}>
                                  {gen.latency_s !== null && gen.latency_s !== undefined && (
                                    <span>{gen.latency_s.toFixed(2)}s</span>
                                  )}
                                  {gen.usage?.total_tokens && (
                                    <span>{gen.usage.total_tokens} toks</span>
                                  )}
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </div>
                              </button>

                              {isExpanded && (
                                <div className={styles.generationContent}>
                                  <div>
                                    <span className={styles.traceBlockLabel}>Prompt / Input:</span>
                                    <pre className={styles.traceCodeBox}>
                                      {typeof gen.input === 'string' ? gen.input : JSON.stringify(gen.input, null, 2)}
                                    </pre>
                                  </div>
                                  <div>
                                    <span className={styles.traceBlockLabel}>Salida del Modelo:</span>
                                    <pre className={styles.traceCodeBox}>
                                      {typeof gen.output === 'string' ? gen.output : JSON.stringify(gen.output, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Desglose de etapas */}
                  {timeline && timeline.stages.length > 0 && (
                    <div>
                      <span style={{ fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                        Desglose de Etapas
                      </span>
                      <div className={styles.traceStagesList}>
                        {timeline.stages.map((stage) => {
                          const statusClass =
                            stage.status === 'completed'
                              ? styles.traceStatusCompleted
                              : stage.status === 'failed'
                              ? styles.traceStatusFailed
                              : stage.status === 'active'
                              ? styles.traceStatusActive
                              : styles.traceStatusPending
                          return (
                            <div key={stage.id} className={styles.traceStageCard}>
                              <div className={styles.traceStageHeader}>
                                <div className={styles.traceStageName}>
                                  <span>{stage.label}</span>
                                  <span className={styles.traceStageActor}>({stage.actor})</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  {stage.durationMs !== null && (
                                    <span className={styles.traceStageDuration}>{stage.durationMs} ms</span>
                                  )}
                                  <span className={`${styles.traceStageStatus} ${statusClass}`}>
                                    {stage.status === 'completed'
                                      ? 'Completado'
                                      : stage.status === 'failed'
                                      ? 'Fallo'
                                      : stage.status === 'active'
                                      ? 'Activo'
                                      : 'Pendiente'}
                                  </span>
                                </div>
                              </div>
                              <p className={styles.traceStageSummary}>{stage.summary}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {inspectorTab === 'files' && (
                <>
                  {netlistFiles.length === 0 ? (
                    <div className={styles.emptyTabState}>
                      <FolderGit2 size={24} style={{ opacity: 0.4 }} />
                      <p>Aún no se han generado archivos de circuito en esta conversación.</p>
                    </div>
                  ) : (
                    <section aria-labelledby="circuits-title" className={styles.circuits}>
                      <h2 id="circuits-title">Circuitos generados ({netlistFiles.length})</h2>
                      {netlistFiles.map((file) => {
                        const isExpanded = previewFileId === file.id
                        const isSimCurveVisible = simCurveFileId === file.id
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
                                {file.simResult?.curve && file.simResult.curve.length > 0 && (
                                  <button
                                    type="button"
                                    className={`${styles.circuitSimBtn} ${isSimCurveVisible ? styles.circuitSimBtnActive : ''}`}
                                    onClick={() => setSimCurveFileId(isSimCurveVisible ? null : file.id)}
                                    title="Ver curva de simulación SPICE real"
                                  >
                                    <Activity size={13} />
                                    <span>{isSimCurveVisible ? 'Ocultar Curva' : 'Curva SPICE'}</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={styles.circuitPreviewBtn}
                                  onClick={() => setPreviewFileId(isExpanded ? null : file.id)}
                                  aria-expanded={isExpanded}
                                  title={isExpanded ? 'Ocultar esquema' : 'Ver esquema gráfico'}
                                >
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  <span>{isExpanded ? 'Ocultar' : 'Esquema'}</span>
                                </button>
                                <button
                                  type="button"
                                  className={styles.circuitDownloadBtn}
                                  onClick={() => downloadNetlistFile(file.name, file.content)}
                                  title="Descargar archivo netlist .cir"
                                >
                                  <Download size={13} />
                                  <span>Descargar</span>
                                </button>
                                <Link
                                  to={`/visualizer?conversationId=${conversation.id}&fileId=${file.id}`}
                                  className={styles.circuitOpenBtn}
                                  title="Abrir en pantalla completa en el visualizador"
                                >
                                  <span>Visualizador</span>
                                  <ArrowUpRight size={13} />
                                </Link>
                              </div>
                            </div>
                            {isSimCurveVisible && file.simResult?.curve && (
                              <div style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
                                <SimulationChart
                                  curve={file.simResult.curve}
                                  analysisType={file.simResult.analysis_type}
                                  xUnit={file.simResult.x_unit}
                                  yUnit={file.simResult.y_unit}
                                  metricName={file.simResult.metric_name}
                                  measuredValue={file.simResult.measured_value}
                                  targetValue={file.simResult.target_value}
                                  title={`Simulación SPICE: ${file.name}`}
                                  compact
                                />
                              </div>
                            )}
                            {isExpanded ? (
                              <NetlistDiagram netlistText={file.content} title={file.name} />
                            ) : null}
                          </div>
                        )
                      })}
                    </section>
                  )}
                </>
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
