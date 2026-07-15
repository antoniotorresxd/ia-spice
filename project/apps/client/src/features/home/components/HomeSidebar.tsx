import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { ConversationSummary } from '../model/home-types'

type HomeSidebarProps = {
  conversations: ConversationSummary[]
  isOpen: boolean
  onClose: () => void
  onSignOut: () => Promise<void>
  userName: string
}

const navigation = [
  ['Inicio', '⌂'],
  ['Nueva solicitud', '+'],
  ['Proyectos', '◇'],
  ['Conversaciones', '◫'],
  ['Archivos', '▱'],
  ['Ejecuciones', '◌'],
] as const

export function HomeSidebar({
  conversations,
  isOpen,
  onClose,
  onSignOut,
  userName,
}: HomeSidebarProps) {
  const navigate = useNavigate()
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const profileTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isProfileMenuOpen) return

    const closeAndRestoreFocus = () => {
      setIsProfileMenuOpen(false)
      profileTriggerRef.current?.focus()
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        closeAndRestoreFocus()
      }
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
        <span aria-hidden="true" className="home-brand-mark">
          EM
        </span>
        <span>Ecosistema Multiagente</span>
        <button aria-label="Cerrar navegación" onClick={closeNavigation} type="button">
          ×
        </button>
      </div>
      <nav aria-label="Navegación principal">
        <ul>
          {navigation.map(([label, icon], index) => (
            <li key={label}>
              <button aria-current={index === 0 ? 'page' : undefined} type="button">
                <span aria-hidden="true">{icon}</span>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-labelledby="recent-conversations-title" className="home-recents">
        <h2 id="recent-conversations-title">Recientes</h2>
        <ul>
          {conversations.slice(0, 4).map((conversation) => (
            <li key={conversation.id}>
              <button type="button">
                <span aria-hidden="true" className="home-recent-dot" />
                <span>{conversation.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="home-user-menu" ref={profileMenuRef}>
        {isProfileMenuOpen && (
          <div aria-label="Menú de perfil" className="home-profile-menu" role="menu">
            <button onClick={() => goToSettings('/settings/profile')} role="menuitem" type="button">
              Perfil
            </button>
            <button onClick={() => goToSettings('/settings/models')} role="menuitem" type="button">
              Modelos y providers
            </button>
            <button onClick={() => void signOut()} role="menuitem" type="button">
              Cerrar sesión
            </button>
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
          <span aria-hidden="true" className="home-user-avatar">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span>{userName}</span>
          <span aria-hidden="true" className="home-profile-chevron">⌃</span>
        </button>
      </div>
    </aside>
  )
}
