import { useState, type ReactNode } from 'react'

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
        <div className={styles.content}>{children}</div>
      </section>
      <AssistantPanel />
    </main>
  )
}
