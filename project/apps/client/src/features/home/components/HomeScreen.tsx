import { useEffect, useState } from 'react'

import type {
  ConversationExecution,
  HomeOverviewData,
  UsagePeriod,
} from '../model/home-types'
import type { HomeService } from '../services/home-service'
import { ActivityTimeline } from './ActivityTimeline'
import { AssistantPanel } from './AssistantPanel'
import { ContextPanel } from './ContextPanel'
import { HomeOverview } from './HomeOverview'
import { HomeSidebar } from './HomeSidebar'
import { NaturalLanguageComposer } from './NaturalLanguageComposer'
import styles from './HomeScreen.module.css'

type HomeScreenProps = {
  service: HomeService
  userName: string
  onSignOut: () => Promise<void>
}

export function HomeScreen({ service, userName, onSignOut }: HomeScreenProps) {
  const [overview, setOverview] = useState<HomeOverviewData | null>(null)
  const [period, setPeriod] = useState<UsagePeriod>('30d')
  const [selectedExecution, setSelectedExecution] =
    useState<ConversationExecution | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

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

  const conversations = overview?.recentConversations ?? []

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
    <main className={styles.workspace}>
      <HomeSidebar
        conversations={conversations}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSignOut={signOut}
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
            <span>Inicio</span>
            {selectedExecution ? (
              <>
                <span aria-hidden="true">›</span>
                <strong>{selectedExecution.conversation.title}</strong>
              </>
            ) : null}
          </div>
          <button
            className={styles.contextButton}
            onClick={() => setContextOpen(true)}
            type="button"
          >
            Mostrar detalles
          </button>
        </header>

        <div className={styles.contentScroll}>
          <div className={styles.content}>
            <header className={styles.welcome}>
              <p>Workspace personal</p>
              <h1>Buenos días, {userName}</h1>
              <span>
                Revisa tu actividad o inicia una nueva solicitud desde lenguaje
                natural.
              </span>
            </header>

            <NaturalLanguageComposer onSubmit={submitPrompt} />

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
      <AssistantPanel />
      <p aria-live="polite" className={styles.srOnly}>
        {announcement}
      </p>
    </main>
  )
}
