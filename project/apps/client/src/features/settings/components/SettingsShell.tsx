import { useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { AssistantPanel } from '../../home/components/AssistantPanel'
import { HomeSidebar } from '../../home/components/HomeSidebar'
import type { ConversationSummary } from '../../home/model/home-types'
import '../../home/components/HomeScreen.module.css'
import styles from './SettingsShell.module.css'

type SettingsShellProps = {
  children: ReactNode
  userName: string
  userEmail: string
  onSignOut: () => Promise<void>
  conversations?: ConversationSummary[]
}

export function SettingsShell({
  children,
  userName,
  userEmail,
  onSignOut,
  conversations = [],
}: SettingsShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <main className={styles.workspace}>
      <HomeSidebar
        conversations={conversations}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSignOut={onSignOut}
        userName={userName}
      />
      <section className={styles.mainColumn}>
        <header className={styles.topbar}>
          <button
            aria-label="Abrir navegación"
            className={styles.mobileButton}
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            ☰
          </button>
          <div>
            <span>Ajustes</span>
            <span aria-hidden="true">›</span>
            <strong>{userEmail}</strong>
          </div>
        </header>
        <div className={styles.settingsWorkspace}>
          <aside className={styles.settingsRail}>
            <Link className={styles.backLink} to="/">
              <span aria-hidden="true">←</span>
              Volver a la aplicación
            </Link>
            <div className={styles.settingsRailHeading}>
              <span aria-hidden="true" className={styles.settingsMark}>
                ⚙
              </span>
              <div>
                <strong>Configuración</strong>
                <small>Preferencias del workspace</small>
              </div>
            </div>
            <nav aria-label="Configuración" className={styles.settingsNav}>
              <p>Personal</p>
              <NavLink to="/settings/profile">
                <span aria-hidden="true">○</span>
                Perfil
              </NavLink>
              <NavLink to="/settings/models">
                <span aria-hidden="true">✦</span>
                Modelos y providers
              </NavLink>
            </nav>
          </aside>
          <div className={styles.content}>{children}</div>
        </div>
      </section>
      <AssistantPanel />
    </main>
  )
}
