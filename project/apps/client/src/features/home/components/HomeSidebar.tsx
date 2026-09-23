import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Layers,
  MessageSquare,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import type { ConversationSummary } from '../model/home-types'
import type { WorkspaceProject } from '../../workspace/model/workspace-types'
import { ConversationActions } from '../../workspace/components/ConversationActions'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { useStoredNumber } from '@/lib/layout-preferences'
import styles from './HomeSidebar.module.css'

type SidebarConversation = Pick<ConversationSummary, 'id' | 'projectId' | 'title' | 'updatedAt'>

type HomeSidebarProps = {
  conversations: SidebarConversation[]
  isOpen: boolean
  onClose: () => void
  onSignOut: () => Promise<void>
  projects?: Array<Pick<WorkspaceProject, 'id' | 'name'> & Partial<Pick<WorkspaceProject, 'updatedAt'>>>
  onAssignConversation?: (conversationId: string, projectId: string, previousProjectId: string | null) => Promise<void> | void
  onDeleteProject?: (projectId: string) => Promise<void> | void
  onDeleteConversation?: (conversationId: string) => Promise<void> | void
  userName: string
  isCollapsed?: boolean
  isLoading?: boolean
}

const workspaceConversationMime = 'application/x-workspace-conversation'
const DEFAULT_SIDEBAR_WIDTH = 240
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 540

const navigation = [
  ['Inicio', '⌂', '/'],
  ['Nueva solicitud', '+', '/new'],
  ['Proyectos', '◇', '/projects'],
  ['Conversaciones', '◫', '/conversations'],
  ['Archivos', '▱', '/files'],
  ['Ejecuciones', '◌', '/executions'],
  ['Visualizador', '⏚', '/visualizer'],
] as const

export function HomeSidebar({
  conversations,
  isOpen,
  onClose,
  onSignOut,
  onAssignConversation = () => undefined,
  onDeleteProject,
  onDeleteConversation,
  projects = [],
  userName,
  isCollapsed = false,
  isLoading = false,
}: HomeSidebarProps) {

  const reducedMotion = useReducedMotion()
  const navigate = useNavigate()
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([])
  const [isUnassignedExpanded, setIsUnassignedExpanded] = useState(true)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [projectPendingDelete, setProjectPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const profileTriggerRef = useRef<HTMLButtonElement>(null)

  const [sidebarWidth, setSidebarWidth] = useStoredNumber('spice_sidebar_width', DEFAULT_SIDEBAR_WIDTH)
  const [isResizing, setIsResizing] = useState(false)

  const latestWidthRef = useRef(sidebarWidth)

  useEffect(() => {
    latestWidthRef.current = sidebarWidth
    const clamped = Math.min(Math.max(sidebarWidth, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH)
    document.documentElement.style.setProperty('--sidebar-width', `${clamped}px`)
  }, [sidebarWidth])

  const startResizing = (mouseDownEvent: React.PointerEvent) => {
    mouseDownEvent.preventDefault()
    mouseDownEvent.stopPropagation()
    const target = mouseDownEvent.currentTarget
    try {
      target.setPointerCapture(mouseDownEvent.pointerId)
    } catch {
      // ignore
    }

    setIsResizing(true)
    document.documentElement.setAttribute('data-sidebar-resizing', 'true')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (e: PointerEvent) => {
      const newWidth = Math.min(Math.max(e.clientX, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH)
      latestWidthRef.current = newWidth
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`)
    }

    const handlePointerUp = (e: PointerEvent) => {
      try {
        target.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      setIsResizing(false)
      document.documentElement.removeAttribute('data-sidebar-resizing')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setSidebarWidth(latestWidthRef.current)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
  }

  const handleDoubleClickResizer = () => {
    latestWidthRef.current = DEFAULT_SIDEBAR_WIDTH
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
    document.documentElement.style.setProperty('--sidebar-width', `${DEFAULT_SIDEBAR_WIDTH}px`)
  }

  useEffect(() => {
    if (!isProfileMenuOpen) return

    const closeAndRestoreFocus = () => {
      setIsProfileMenuOpen(false)
      profileTriggerRef.current?.focus()
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) closeAndRestoreFocus()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAndRestoreFocus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isProfileMenuOpen])

  const goToSettings = (path: string) => {
    setIsProfileMenuOpen(false)
    navigate(path)
  }

  const signOut = async () => {
    setIsProfileMenuOpen(false)
    await onSignOut()
  }

  const closeNavigation = () => {
    setIsProfileMenuOpen(false)
    onClose()
  }

  const handleDropOnProject = (targetProjectId: string | null, event: React.DragEvent) => {
    event.preventDefault()
    setDragOverFolderId(null)
    try {
      const raw = event.dataTransfer.getData(workspaceConversationMime)
      if (!raw) return
      const payload = JSON.parse(raw) as { conversationId: string; previousProjectId: string | null }
      if (payload.conversationId && targetProjectId && payload.previousProjectId !== targetProjectId) {
        void onAssignConversation(payload.conversationId, targetProjectId, payload.previousProjectId)
      }
    } catch {
      // Ignorar datos de arrastre incompatibles
    }
  }

  const conversationItem = (conversation: SidebarConversation) => (
    <li
      className="home-conversation-node"
      draggable
      key={conversation.id}
      onDragStart={(event) =>
        event.dataTransfer.setData(
          workspaceConversationMime,
          JSON.stringify({
            conversationId: conversation.id,
            previousProjectId: conversation.projectId,
          }),
        )
      }
    >
      <div className="home-conversation-row">
        <NavLink
          className="home-conversation-link"
          onClick={closeNavigation}
          title={conversation.title}
          to={`/conversations/${conversation.id}`}
        >
          <MessageSquare aria-hidden="true" className="home-conversation-icon" size={12} />
          <span className="home-conversation-title">{conversation.title}</span>
        </NavLink>
        <ConversationActions
          conversationId={conversation.id}
          conversationTitle={conversation.title}
          currentProjectId={conversation.projectId}
          onAssign={onAssignConversation}
          onDelete={onDeleteConversation}
          projects={projects}
        />
      </div>
    </li>
  )


  const sortedProjects = [...projects].sort((a, b) => {
    const timeA = a.updatedAt ? Date.parse(a.updatedAt) : 0
    const timeB = b.updatedAt ? Date.parse(b.updatedAt) : 0
    return timeB - timeA
  })

  const unassignedConversations = [...conversations]
    .filter(({ projectId }) => projectId === null)
    .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''))

  return (
    <aside
      className={`home-sidebar ${styles.sidebar}`}
      data-collapsed={isCollapsed}
      data-open={isOpen}
    >
      <div className="home-brand">
        <span aria-hidden="true" className="home-brand-mark">EM</span>
        <span className="home-brand-title">Ecosistema Multiagente</span>
        <button aria-label="Cerrar navegación" className={styles.closeMobile} onClick={closeNavigation} type="button">×</button>
      </div>

      <nav aria-label="Navegación principal">
        <LayoutGroup>
          <ul>
            {navigation.map(([label, icon, path]) => (
              <li className={styles.navItem} key={label}>
                <NavLink
                  data-tour={path === '/new' ? 'new-request' : undefined}
                  end={path === '/'}
                  onClick={closeNavigation}
                  to={path}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (reducedMotion ? (
                        <div aria-hidden="true" className={styles.highlight} />
                      ) : (
                        <motion.div
                          aria-hidden="true"
                          className={styles.highlight}
                          layoutId="sidebar-active-highlight"
                          initial={false}
                          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                        />
                      ))}
                      <span aria-hidden="true" className={styles.navIcon}>{icon}</span>
                      <span className={styles.navLabel}>{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </LayoutGroup>
      </nav>

      <section
        aria-labelledby="workspace-projects-title"
        className="home-recents home-project-tree"
        data-tour="projects-tree"
      >
        <div className="home-workspace-header">
          <div className={styles.workspaceHeaderLeft}>
            <h2 id="workspace-projects-title">Espacio</h2>
            {isLoading && (
              <span className={styles.loadingBadge} title="Sincronizando espacio…">
                <span aria-hidden="true" className={styles.loadingPulse} />
                Sincronizando…
              </span>
            )}
          </div>
          {!isLoading && (
            <span className="home-drag-hint" title="Arrastra conversaciones a las carpetas">Drag & drop</span>
          )}
        </div>

        {isLoading && sortedProjects.length === 0 && unassignedConversations.length === 0 ? (
          <div aria-busy="true" aria-label="Cargando espacio" className={styles.skeletonTree}>
            <div className={styles.skeletonNode}>
              <div aria-hidden="true" className={styles.skeletonIcon} />
              <div aria-hidden="true" className={styles.skeletonBar} style={{ width: '65%' }} />
            </div>
            <div className={styles.skeletonNode}>
              <div aria-hidden="true" className={styles.skeletonIcon} />
              <div aria-hidden="true" className={styles.skeletonBar} style={{ width: '80%' }} />
            </div>
            <div className={styles.skeletonNode}>
              <div aria-hidden="true" className={styles.skeletonIcon} />
              <div aria-hidden="true" className={styles.skeletonBar} style={{ width: '50%' }} />
            </div>
          </div>
        ) : (
          <ul>
            {sortedProjects.map((project) => {
              const isExpanded = expandedProjectIds.includes(project.id)
              const children = [...conversations]
                .filter(({ projectId }) => projectId === project.id)
                .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''))
              const isDragOver = dragOverFolderId === project.id

              return (
                <li
                  className="home-folder-node"
                  data-drag-over={isDragOver}
                  key={project.id}
                  onDragLeave={() => setDragOverFolderId((id) => (id === project.id ? null : id))}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOverFolderId(project.id)
                  }}
                  onDrop={(e) => handleDropOnProject(project.id, e)}
                >
                  <div className={`home-project-row ${isDragOver ? 'home-project-drop-target' : ''}`}>
                    <button
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Contraer' : 'Expandir'} ${project.name}`}
                      className="home-folder-toggle"
                      onClick={() =>
                        setExpandedProjectIds((current) =>
                          isExpanded ? current.filter((id) => id !== project.id) : [...current, project.id],
                        )
                      }
                      type="button"
                    >
                      <span aria-hidden="true" className="home-chevron-wrapper">
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span className="home-chevron-text-fallback">{isExpanded ? '⌄' : '›'}</span>
                      </span>
                    </button>

                    <NavLink className="home-folder-link" onClick={closeNavigation} title={project.name} to={`/projects/${project.id}`}>
                      {isExpanded ? (
                        <FolderOpen aria-hidden="true" className="home-folder-icon is-active" size={13} />
                      ) : (
                        <Folder aria-hidden="true" className="home-folder-icon" size={13} />
                      )}
                      <span className="home-folder-name">{project.name}</span>
                    </NavLink>

                    <span className="home-folder-count">{children.length}</span>

                    {onDeleteProject && (
                      <button
                        aria-label={`Eliminar proyecto ${project.name}`}
                        className="home-folder-delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          setProjectPendingDelete(project)
                        }}
                        title={`Eliminar proyecto ${project.name}`}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={12} />
                      </button>
                    )}
                  </div>

                  <div
                    aria-hidden={!isExpanded}
                    className={styles.projectExpansion}
                    data-expanded={isExpanded}
                    inert={!isExpanded}
                  >
                    <div className={styles.projectExpansionInner}>
                      <ul className="home-project-conversations">
                        {children.slice(0, 5).map(conversationItem)}
                      </ul>
                    </div>
                  </div>
                </li>
              )
            })}

            <li
              className="home-folder-node"
              data-drag-over={dragOverFolderId === 'unassigned'}
              onDragLeave={() => setDragOverFolderId((id) => (id === 'unassigned' ? null : id))}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverFolderId('unassigned')
              }}
              onDrop={(e) => handleDropOnProject(null, e)}
            >
              <div className="home-folder-header">
                <button
                  aria-expanded={isUnassignedExpanded}
                  aria-label={`${isUnassignedExpanded ? 'Contraer' : 'Expandir'} Sin proyecto`}
                  className="home-folder-toggle"
                  onClick={() => setIsUnassignedExpanded((prev) => !prev)}
                  type="button"
                >
                  <span aria-hidden="true" className="home-chevron-wrapper">
                    {isUnassignedExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <span className="home-chevron-text-fallback">{isUnassignedExpanded ? '⌄' : '›'}</span>
                  </span>
                </button>
                <NavLink className="home-folder-link" onClick={closeNavigation} title="Sin proyecto" to="/conversations">
                  <Layers aria-hidden="true" className="home-folder-icon" size={13} />
                  <span>Sin proyecto</span>
                </NavLink>
                <span className="home-folder-count">
                  {unassignedConversations.length}
                </span>
              </div>
              {isUnassignedExpanded && (
                <ul className="home-project-conversations">
                  {unassignedConversations.slice(0, 5).map(conversationItem)}
                </ul>
              )}
            </li>
          </ul>
        )}
      </section>

      <div className="home-user-menu" data-tour="sidebar-footer" ref={profileMenuRef}>
        {isProfileMenuOpen && (
          <div aria-label="Menú de perfil" className="home-profile-menu" role="menu">
            <button onClick={() => goToSettings('/settings/profile')} role="menuitem" type="button">Configuración</button>
            <button onClick={() => void signOut()} role="menuitem" type="button">Cerrar sesión</button>
          </div>
        )}
        <button
          aria-expanded={isProfileMenuOpen}
          aria-haspopup="menu"
          aria-label={`Perfil de ${userName}`}
          className="home-profile-trigger"
          onClick={() => setIsProfileMenuOpen((open) => !open)}
          ref={profileTriggerRef}
          type="button"
        >
          <span aria-hidden="true" className="home-user-avatar">{userName.slice(0, 1).toUpperCase()}</span>
          <span>{userName}</span>
          <span aria-hidden="true" className="home-profile-chevron">⌃</span>
        </button>
      </div>

      <ConfirmDeleteModal
        isOpen={projectPendingDelete !== null}
        title={`¿Eliminar proyecto "${projectPendingDelete?.name ?? ''}"?`}
        description="Las conversaciones se conservarán sin proyecto. Esta acción no se puede deshacer."
        confirmLabel="Eliminar proyecto"
        onCancel={() => setProjectPendingDelete(null)}
        onConfirm={async () => {
          if (projectPendingDelete && onDeleteProject) {
            const id = projectPendingDelete.id
            setProjectPendingDelete(null)
            await onDeleteProject(id)
          }
        }}
      />

      {!isCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={sidebarWidth}
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-label="Redimensionar barra lateral"
          tabIndex={0}
          className={styles.resizer}
          data-resizing={isResizing}
          onDoubleClick={handleDoubleClickResizer}
          onPointerDown={startResizing}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              const next = Math.max(sidebarWidth - 16, MIN_SIDEBAR_WIDTH)
              setSidebarWidth(next)
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              const next = Math.min(sidebarWidth + 16, MAX_SIDEBAR_WIDTH)
              setSidebarWidth(next)
            } else if (e.key === 'Home') {
              e.preventDefault()
              setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
            }
          }}
          title="Arrastra para redimensionar (doble clic para restablecer)"
        >
          <div aria-hidden="true" className={styles.resizerGrip} />
        </div>
      )}
    </aside>

  )
}
