import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import type { ConversationSummary } from '../model/home-types'
import type { WorkspaceProject } from '../../workspace/model/workspace-types'

type SidebarConversation = Pick<ConversationSummary, 'id' | 'projectId' | 'title' | 'updatedAt'>

type HomeSidebarProps = {
  conversations: SidebarConversation[]
  isOpen: boolean
  onClose: () => void
  onSignOut: () => Promise<void>
  projects?: WorkspaceProject[]
  userName: string
}

const navigation = [
  ['Inicio', '⌂', '/'],
  ['Nueva solicitud', '+', '/new'],
  ['Proyectos', '◇', '/projects'],
  ['Conversaciones', '◫', '/conversations'],
  ['Archivos', '▱', '/files'],
  ['Ejecuciones', '◌', '/executions'],
] as const

export function HomeSidebar({
  conversations,
  isOpen,
  onClose,
  onSignOut,
  projects = [],
  userName,
}: HomeSidebarProps) {
  const navigate = useNavigate()
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([])
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const profileTriggerRef = useRef<HTMLButtonElement>(null)

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

  return (
    <aside className="home-sidebar" data-open={isOpen}>
      <div className="home-brand">
        <span aria-hidden="true" className="home-brand-mark">EM</span>
        <span>Ecosistema Multiagente</span>
        <button aria-label="Cerrar navegación" onClick={closeNavigation} type="button">×</button>
      </div>
      <nav aria-label="Navegación principal">
        <ul>
          {navigation.map(([label, icon, path]) => (
            <li key={label}>
              <NavLink end={path === '/'} onClick={closeNavigation} to={path}>
                <span aria-hidden="true">{icon}</span>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-labelledby="workspace-projects-title" className="home-recents home-project-tree">
        <h2 id="workspace-projects-title">Espacio</h2>
        <ul>
          <li>
            <NavLink onClick={closeNavigation} to="/conversations">
              <span aria-hidden="true" className="home-recent-dot" />
              <span>Sin proyecto</span>
            </NavLink>
          </li>
          {projects.map((project) => {
            const isExpanded = expandedProjectIds.includes(project.id)
            const children = conversations.filter(({ projectId }) => projectId === project.id)
            return (
              <li key={project.id}>
                <div className="home-project-row">
                  <button
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Contraer' : 'Expandir'} ${project.name}`}
                    onClick={() => setExpandedProjectIds((current) =>
                      isExpanded ? current.filter((id) => id !== project.id) : [...current, project.id]
                    )}
                    type="button"
                  >
                    <span aria-hidden="true">{isExpanded ? '⌄' : '›'}</span>
                  </button>
                  <NavLink onClick={closeNavigation} to={`/projects/${project.id}`}>{project.name}</NavLink>
                </div>
                {isExpanded && children.length > 0 ? (
                  <ul className="home-project-conversations">
                    {children.slice(0, 4).map((conversation) => (
                      <li key={conversation.id}>
                        <NavLink onClick={closeNavigation} to={`/conversations/${conversation.id}`}>
                          {conversation.title}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
          {projects.length === 0 && conversations.slice(0, 4).map((conversation) => (
            <li key={conversation.id}>
              <NavLink onClick={closeNavigation} to={`/conversations/${conversation.id}`}>
                <span aria-hidden="true" className="home-recent-dot" />
                <span>{conversation.title}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </section>
      <div className="home-user-menu" ref={profileMenuRef}>
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
    </aside>
  )
}
