import { PanelLeft, PanelLeftClose } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { AssistantPanel } from '../../home/components/AssistantPanel'
import { HomeSidebar } from '../../home/components/HomeSidebar'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useStoredBoolean } from '@/lib/layout-preferences'
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useStoredBoolean('spice_sidebar_collapsed', false)

  return (
    <main className={styles.workspace} data-collapsed={isSidebarCollapsed}>
      <HomeSidebar
        conversations={conversations}
        isOpen={sidebarOpen}
        isCollapsed={isSidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onSignOut={onSignOut}
        userName={userName}
      />
      <section className={styles.mainColumn}>
        <header className={styles.topbar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              aria-label="Abrir navegación"
              className={styles.mobileButton}
              onClick={() => setSidebarOpen(true)}
              type="button"
            >
              ☰
            </button>
            <button
              type="button"
              className="home-sidebar-collapse-btn"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              aria-label={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
              title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                cursor: 'pointer',
              }}
            >
              {isSidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <span>Ajustes</span>
            <span aria-hidden="true">›</span>
            <strong>{userEmail}</strong>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ThemeToggle />
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
