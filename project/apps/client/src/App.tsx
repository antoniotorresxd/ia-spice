import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthScreen } from './features/auth/components/AuthScreen'
import { authClient } from './features/auth/services/auth-client'
import { authService } from './features/auth/services/auth-service'
import { HomeScreen } from './features/home/components/HomeScreen'
import { mockHomeService } from './features/home/services/mock-home-service'
import { ModelSettingsScreen } from './features/settings/components/ModelSettingsScreen'
import { ProfileSettingsScreen } from './features/settings/components/ProfileSettingsScreen'
import { mockSettingsService } from './features/settings/services/mock-settings-service'
import { WorkspaceShell } from './features/workspace/components/WorkspaceShell'
import { createMockWorkspaceService } from './features/workspace/services/mock-workspace-service'
import './App.css'

const workspaceService = createMockWorkspaceService()

function PlaceholderScreen({ heading }: { heading: string }) {
  return <h1>{heading}</h1>
}

function UpcomingScreen({ heading }: { heading: string }) {
  return (
    <section>
      <h1>{heading}</h1>
      <p>Próximamente</p>
    </section>
  )
}

function App() {
  const { data: session, isPending } = authClient.useSession()

  async function handleSignOut() {
    const result = await authService.signOut()

    if (!result.ok) {
      throw new Error(result.message)
    }
  }

  if (isPending) {
    return (
      <main aria-busy="true" aria-live="polite" className="app-session-gate">
        <p className="app-session-status">
          <span aria-hidden="true" className="app-session-pulse" />
          Preparando tu espacio…
        </p>
      </main>
    )
  }

  if (!session) {
    return <AuthScreen service={authService} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <HomeScreen
              onSignOut={handleSignOut}
              service={mockHomeService}
              userName={session.user.name}
            />
          }
        />
        <Route
          path="/settings/profile"
          element={
            <ProfileSettingsScreen
              onSignOut={handleSignOut}
              service={mockSettingsService}
            />
          }
        />
        <Route
          path="/settings/models"
          element={
            <ModelSettingsScreen
              onSignOut={handleSignOut}
              service={mockSettingsService}
            />
          }
        />
        <Route
          element={
            <WorkspaceShell
              onSignOut={handleSignOut}
              service={workspaceService}
              userName={session.user.name}
            />
          }
        >
          <Route path="/new" element={<PlaceholderScreen heading="Nueva solicitud" />} />
          <Route path="/projects" element={<PlaceholderScreen heading="Proyectos" />} />
          <Route path="/projects/:projectId" element={<PlaceholderScreen heading="Detalle del proyecto" />} />
          <Route path="/conversations" element={<PlaceholderScreen heading="Conversaciones" />} />
          <Route path="/conversations/:conversationId" element={<PlaceholderScreen heading="Detalle de la conversación" />} />
          <Route path="/files" element={<UpcomingScreen heading="Archivos" />} />
          <Route path="/executions" element={<UpcomingScreen heading="Ejecuciones" />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
