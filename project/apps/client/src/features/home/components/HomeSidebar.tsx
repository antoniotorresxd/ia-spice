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
  return (
    <aside className="home-sidebar" data-open={isOpen}>
      <div className="home-brand">
        <span aria-hidden="true" className="home-brand-mark">
          EM
        </span>
        <span>Ecosistema Multiagente</span>
        <button aria-label="Cerrar navegación" onClick={onClose} type="button">
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
      <div className="home-user-menu">
        <span aria-hidden="true" className="home-user-avatar">
          {userName.slice(0, 1).toUpperCase()}
        </span>
        <span>{userName}</span>
        <button onClick={() => void onSignOut()} type="button">
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

