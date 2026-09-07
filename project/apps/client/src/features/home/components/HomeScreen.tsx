import { PanelLeft, PanelLeftClose, PanelRight, PanelRightClose, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type {
  ConversationExecution,
  HomeOverviewData,
  UsagePeriod,
} from '../model/home-types'
import type { HomeService } from '../services/home-service'
import type { WorkspaceService } from '../../workspace/services/workspace-service'
import type { WorkspaceSnapshot } from '../../workspace/model/workspace-types'
import { ActivityTimeline } from './ActivityTimeline'
import { AssistantPanel } from './AssistantPanel'
import { ContextPanel } from './ContextPanel'
import { HomeHero } from './HomeHero'
import { HomeOverview } from './HomeOverview'
import { HomeSidebar } from './HomeSidebar'
import { NaturalLanguageComposer } from './NaturalLanguageComposer'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useStoredBoolean } from '@/lib/layout-preferences'
import styles from './HomeScreen.module.css'

type HomeScreenProps = {
  service: HomeService
  workspaceService?: WorkspaceService
  userName: string
  onSignOut: () => Promise<void>
}

export function HomeScreen({ service, workspaceService, userName, onSignOut }: HomeScreenProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchTriggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchCloseRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isSearchOpen) return
    searchInputRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsSearchOpen(false)
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        if (document.activeElement === searchInputRef.current) searchCloseRef.current?.focus()
        else searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    const trigger = searchTriggerRef.current
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      trigger?.focus()
    }
  }, [isSearchOpen])

  const composerRef = useRef<HTMLDivElement>(null)
  const [overview, setOverview] = useState<HomeOverviewData | null>(null)
  const [period, setPeriod] = useState<UsagePeriod>('30d')
  const [selectedExecution, setSelectedExecution] =
    useState<ConversationExecution | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useStoredBoolean('spice_sidebar_collapsed', false)
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useStoredBoolean('spice_right_sidebar_collapsed', false)
  const [contextOpen, setContextOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)

  useEffect(() => {
    let isCurrent = true

    service
      .getHomeOverview(period)
      .then((data) => {
        if (!isCurrent) return
        setOverview(data)
        setLoadError(false)
      })
      .catch(() => {
        if (isCurrent) setLoadError(true)
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [period, refreshKey, service])

  useEffect(() => {
    if (!workspaceService) return
    let isCurrent = true
    workspaceService.getSnapshot().then(
      (data) => { if (isCurrent) setSnapshot(data) },
      () => {},
    )
    return () => { isCurrent = false }
  }, [workspaceService])

  const handleDeleteProject = async (projectId: string) => {
    if (!workspaceService) return
    await workspaceService.deleteProject(projectId)
    const next = await workspaceService.getSnapshot()
    setSnapshot(next)
  }

  const handleDeleteConversation = async (conversationId: string) => {
    if (!workspaceService) return
    await workspaceService.deleteConversation(conversationId)
    const next = await workspaceService.getSnapshot()
    setSnapshot(next)
  }

  const handleAssignConversation = async (conversationId: string, projectId: string) => {
    if (!workspaceService) return
    await workspaceService.assignConversation(conversationId, projectId)
    const next = await workspaceService.getSnapshot()
    setSnapshot(next)
  }

  async function submitPrompt(text: string) {
    const execution = await service.submitPrompt({ text })
    setSelectedExecution(execution)
    setContextOpen(true)
    setAnnouncement('Solicitud iniciada. La ejecución está en progreso.')
  }

  async function signOut() {
    setSignOutError(null)
    try {
      await onSignOut()
    } catch {
      setSignOutError('No pudimos cerrar sesión. Inténtalo de nuevo.')
    }
  }

  const sidebarProjects = snapshot?.projects ?? overview?.recentProjects ?? []
  const sidebarConversations = snapshot?.conversations ?? overview?.recentConversations ?? []

  function changePeriod(nextPeriod: UsagePeriod) {
    setIsLoading(true)
    setLoadError(false)
    setPeriod(nextPeriod)
  }

  function retryOverview() {
    setIsLoading(true)
    setLoadError(false)
    setRefreshKey((current) => current + 1)
  }

  return (
    <main
      className={styles.workspace}
      data-collapsed={isSidebarCollapsed}
      data-right-collapsed={isRightSidebarCollapsed}
    >
      <HomeSidebar
        conversations={sidebarConversations}
        isOpen={sidebarOpen}
        isCollapsed={isSidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onSignOut={signOut}
        projects={sidebarProjects}
        onAssignConversation={workspaceService ? handleAssignConversation : undefined}
        onDeleteProject={workspaceService ? handleDeleteProject : undefined}
        onDeleteConversation={workspaceService ? handleDeleteConversation : undefined}
        userName={userName}
      />

      <section className={styles.mainColumn}>
        <header className={styles.topbar}>
          <div>
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
              className={styles.sidebarCollapseBtn}
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              aria-label={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
              title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            >
              {isSidebarCollapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
            </button>
            <span>Inicio</span>
            <button
              className={styles.searchTrigger}
              ref={searchTriggerRef}
              aria-label="Buscar"
              aria-haspopup="dialog"
              aria-expanded={isSearchOpen}
              onClick={() => setIsSearchOpen(true)}
              type="button"
            >
              <Search size={16} aria-hidden="true" />
              <span>Buscar...</span>
              <kbd aria-hidden="true">⌘ K</kbd>
            </button>
            {selectedExecution ? (
              <>
                <span aria-hidden="true">›</span>
                <strong>{selectedExecution.conversation.title}</strong>
              </>
            ) : null}
          </div>
          <div className={styles.topbarActions}>
            <ThemeToggle />
            <button
              type="button"
              className={styles.sidebarCollapseBtn}
              onClick={() => setIsRightSidebarCollapsed((prev) => !prev)}
              aria-label={isRightSidebarCollapsed ? 'Mostrar panel lateral' : 'Ocultar panel lateral'}
              title={isRightSidebarCollapsed ? 'Mostrar panel lateral' : 'Ocultar panel lateral'}
            >
              {isRightSidebarCollapsed ? <PanelRight size={17} /> : <PanelRightClose size={17} />}
            </button>
            <button
              className={styles.contextButton}
              onClick={() => setContextOpen(true)}
              type="button"
            >
              Mostrar detalles
            </button>
          </div>
        </header>

        <div className={styles.contentScroll}>
          <div className={styles.content}>
            <HomeHero
              userName={userName}
              onNewRequest={() => {
                composerRef.current?.querySelector('textarea')?.focus()
              }}
            />

            <div ref={composerRef}>
              <NaturalLanguageComposer onSubmit={submitPrompt} />
            </div>

            {signOutError ? <p role="alert">{signOutError}</p> : null}
            {loadError && !overview ? (
              <section className={styles.loadState}>
                <p role="alert">No pudimos cargar tu espacio.</p>
                <button onClick={retryOverview} type="button">
                  Reintentar
                </button>
              </section>
            ) : isLoading && !overview ? (
              <p aria-busy="true" className={styles.loadState}>
                Preparando tu resumen…
              </p>
            ) : selectedExecution ? (
              <ActivityTimeline execution={selectedExecution} />
            ) : overview ? (
              <HomeOverview
                data={overview}
                onPeriodChange={changePeriod}
              />
            ) : null}
          </div>
        </div>
      </section>

      <ContextPanel
        execution={selectedExecution}
        isOpen={contextOpen}
        onClose={() => setContextOpen(false)}
      />
      <AssistantPanel defaultMode="minimized" />
      {isSearchOpen && (
        <div className={styles.searchOverlay}>
          <button
            className={styles.searchBackdrop}
            aria-label="Cerrar búsqueda"
            tabIndex={-1}
            onClick={() => setIsSearchOpen(false)}
            type="button"
          />
          <section className={styles.searchPanel} role="dialog" aria-modal="true" aria-label="Buscar" aria-describedby="search-coming-soon">
            <div className={styles.searchInputRow}>
              <Search size={20} aria-hidden="true" />
              <input ref={searchInputRef} aria-label="Buscar conversaciones y proyectos" placeholder="Buscar conversaciones y proyectos..." type="search" />
              <button ref={searchCloseRef} onClick={() => setIsSearchOpen(false)} type="button" aria-label="Cerrar buscador">Esc</button>
            </div>
            <p id="search-coming-soon" className={styles.searchEmpty}>Búsqueda próximamente</p>
          </section>
        </div>
      )}
      <p aria-live="polite" className={styles.srOnly}>
        {announcement}
      </p>
    </main>
  )
}
