import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { AssistantPanel } from '../../home/components/AssistantPanel'
import { HomeSidebar } from '../../home/components/HomeSidebar'
import type { WorkspaceSnapshot } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import styles from './WorkspaceShell.module.css'

type WorkspaceShellProps = {
  onSignOut: () => Promise<void>
  service: WorkspaceService
  userName: string
}

export function WorkspaceShell({ onSignOut, service, userName }: WorkspaceShellProps) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    let isCurrent = true
    service.getSnapshot().then(
      (data) => { if (isCurrent) setSnapshot(data) },
      () => { if (isCurrent) setLoadError(true) },
    )
    return () => { isCurrent = false }
  }, [service])

  return (
    <main className={styles.shell}>
      <HomeSidebar
        conversations={snapshot?.conversations ?? []}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSignOut={onSignOut}
        projects={snapshot?.projects ?? []}
        userName={userName}
      />
      <section className={styles.mainColumn}>
        <header className={styles.topbar}>
          <button aria-label="Abrir navegación" className={styles.mobileButton} onClick={() => setSidebarOpen(true)} type="button">☰</button>
          <span>Workspace</span>
        </header>
        <div className={styles.content}>
          {loadError ? <p role="alert">No pudimos cargar tu espacio.</p> : <Outlet />}
        </div>
      </section>
      <AssistantPanel />
    </main>
  )
}
