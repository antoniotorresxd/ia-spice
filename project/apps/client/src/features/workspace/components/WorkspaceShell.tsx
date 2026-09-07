import { PanelLeft, PanelLeftClose } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { AssistantPanel } from '../../home/components/AssistantPanel'
import { HomeSidebar } from '../../home/components/HomeSidebar'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useStoredBoolean } from '@/lib/layout-preferences'
import type { WorkspaceSnapshot } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import styles from './WorkspaceShell.module.css'

type WorkspaceShellProps = {
  onSignOut: () => Promise<void>
  service: WorkspaceService
  userName: string
}

export function WorkspaceShell({ onSignOut, service, userName }: WorkspaceShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const isConversationView = location.pathname.includes('/conversations/')
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useStoredBoolean('spice_sidebar_collapsed', false)
  const [assignmentNotice, setAssignmentNotice] = useState<
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'saved'; conversationId: string; previousProjectId: string | null; projectId: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' })
  const [refreshWarning, setRefreshWarning] = useState(false)

  const refreshSnapshot = async () => {
    const next = await service.getSnapshot()
    setSnapshot(next)
  }

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
    } catch (error) {
      setAssignmentNotice({ status: 'error', message: error instanceof Error ? error.message : 'No pudimos mover la conversación.' })
      return
    }
    setAssignmentNotice({ status: 'saved', conversationId, previousProjectId, projectId })
    try { await refreshSnapshot(); setRefreshWarning(false) } catch { setRefreshWarning(true) }
  }

  const undoAssignment = async () => {
    if (assignmentNotice.status !== 'saved') return
    const { conversationId, previousProjectId } = assignmentNotice
    try {
      await service.restoreConversationProject(conversationId, previousProjectId)
    } catch (error) {
      setAssignmentNotice({ status: 'error', message: error instanceof Error ? error.message : 'No pudimos deshacer el movimiento.' })
      return
    }
    setAssignmentNotice({ status: 'idle' })
    try { await refreshSnapshot(); setRefreshWarning(false) } catch { setRefreshWarning(true) }
  }

  const retryRefresh = async () => {
    try { await refreshSnapshot(); setRefreshWarning(false) } catch { setRefreshWarning(true) }
  }

  const handleDeleteProject = async (projectId: string) => {
    try {
      await service.deleteProject(projectId)
      await refreshSnapshot()
      if (location.pathname === `/projects/${projectId}`) {
        navigate('/projects')
      }
    } catch (error) {
      setAssignmentNotice({ status: 'error', message: error instanceof Error ? error.message : 'No pudimos eliminar el proyecto.' })
    }
  }

  const handleDeleteConversation = async (conversationId: string) => {
    try {
      await service.deleteConversation(conversationId)
      await refreshSnapshot()
      if (location.pathname.startsWith(`/conversations/${conversationId}`)) {
        navigate('/conversations')
      }
    } catch (error) {
      setAssignmentNotice({ status: 'error', message: error instanceof Error ? error.message : 'No pudimos eliminar la conversación.' })
    }
  }

  return (
    <main className={styles.shell} data-collapsed={isSidebarCollapsed}>
      <HomeSidebar
        conversations={snapshot?.conversations ?? []}
        isOpen={sidebarOpen}
        isCollapsed={isSidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onAssignConversation={assignConversation}
        onDeleteProject={handleDeleteProject}
        onDeleteConversation={handleDeleteConversation}
        onSignOut={onSignOut}
        projects={snapshot?.projects ?? []}
        userName={userName}
      />
      <section className={styles.mainColumn}>
        <header className={styles.topbar}>
          <button aria-label="Abrir navegación" className={styles.mobileButton} onClick={() => setSidebarOpen(true)} type="button">☰</button>
          <button
            type="button"
            className={styles.sidebarCollapseBtn}
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            aria-label={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          >
            {isSidebarCollapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <div className={styles.breadcrumb}>
            <span className={styles.brandTag}>SPICE</span>
            <span aria-hidden="true" className={styles.separator}>/</span>
            <span>Workspace</span>
            {location.pathname.startsWith('/projects') ? (
              <>
                <span aria-hidden="true" className={styles.separator}>/</span>
                <span className={styles.currentSection}>Proyectos</span>
              </>
            ) : location.pathname.startsWith('/conversations') ? (
              <>
                <span aria-hidden="true" className={styles.separator}>/</span>
                <span className={styles.currentSection}>Conversaciones</span>
              </>
            ) : null}
          </div>
          <div className={styles.topbarActions}>
            <ThemeToggle />
          </div>
        </header>
        <div className={styles.content} data-full-viewport={isConversationView}>
          {loadError ? (
            <p role="alert">No pudimos cargar tu espacio.</p>
          ) : (
            <Outlet context={{ refreshSnapshot, deleteConversation: handleDeleteConversation, deleteProject: handleDeleteProject }} />
          )}
          {assignmentNotice.status === 'saving' ? <p aria-live="polite">Moviendo conversación…</p> : null}
          {assignmentNotice.status === 'saved' ? <div aria-live="polite" role="status">Conversación movida <button onClick={() => void undoAssignment()} type="button">Deshacer</button></div> : null}
          {assignmentNotice.status === 'error' ? <p role="alert">{assignmentNotice.message}</p> : null}
          {refreshWarning ? <p>La operación se guardó, pero no pudimos actualizar la vista. <button onClick={() => void retryRefresh()} type="button">Reintentar actualización</button></p> : null}
        </div>
      </section>
      {!isConversationView && <AssistantPanel defaultMode="minimized" />}
    </main>
  )
}
