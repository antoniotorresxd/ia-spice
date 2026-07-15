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
  const [assignmentNotice, setAssignmentNotice] = useState<
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'saved'; conversationId: string; previousProjectId: string | null; projectId: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' })

  const refreshSnapshot = async () => setSnapshot(await service.getSnapshot())

  useEffect(() => {
    let isCurrent = true
    service.getSnapshot().then(
      (data) => { if (isCurrent) setSnapshot(data) },
      () => { if (isCurrent) setLoadError(true) },
    )
    return () => { isCurrent = false }
  }, [service])

  const assignConversation = async (conversationId: string, projectId: string, previousProjectId: string | null) => {
    setAssignmentNotice({ status: 'saving' })
    try {
      await service.assignConversation(conversationId, projectId)
      await refreshSnapshot()
      setAssignmentNotice({ status: 'saved', conversationId, previousProjectId, projectId })
    } catch (error) {
      setAssignmentNotice({ status: 'error', message: error instanceof Error ? error.message : 'No pudimos mover la conversación.' })
    }
  }

  const undoAssignment = async () => {
    if (assignmentNotice.status !== 'saved') return
    const { conversationId, previousProjectId } = assignmentNotice
    try {
      await service.restoreConversationProject(conversationId, previousProjectId)
      await refreshSnapshot()
      setAssignmentNotice({ status: 'idle' })
    } catch (error) {
      setAssignmentNotice({ status: 'error', message: error instanceof Error ? error.message : 'No pudimos deshacer el movimiento.' })
    }
  }

  return (
    <main className={styles.shell}>
      <HomeSidebar
        conversations={snapshot?.conversations ?? []}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onAssignConversation={assignConversation}
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
          {loadError ? <p role="alert">No pudimos cargar tu espacio.</p> : <Outlet context={{ refreshSnapshot }} />}
          {assignmentNotice.status === 'saving' ? <p aria-live="polite">Moviendo conversación…</p> : null}
          {assignmentNotice.status === 'saved' ? <div aria-live="polite" role="status">Conversación movida <button onClick={() => void undoAssignment()} type="button">Deshacer</button></div> : null}
          {assignmentNotice.status === 'error' ? <p role="alert">{assignmentNotice.message}</p> : null}
        </div>
      </section>
      <AssistantPanel />
    </main>
  )
}
