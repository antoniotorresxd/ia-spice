import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthScreen } from './features/auth/components/AuthScreen'
import { authClient } from './features/auth/services/auth-client'
import { authService } from './features/auth/services/auth-service'
import { HomeScreen } from './features/home/components/HomeScreen'
import { mockHomeService } from './features/home/services/mock-home-service'
import { ModelSettingsScreen } from './features/settings/components/ModelSettingsScreen'
import { ProfileSettingsScreen } from './features/settings/components/ProfileSettingsScreen'
import { createMockSettingsService } from './features/settings/services/mock-settings-service'
import { WorkspaceShell } from './features/workspace/components/WorkspaceShell'
import { NewRequestScreen } from './features/workspace/components/NewRequestScreen'
import { ProjectsScreen } from './features/workspace/components/ProjectsScreen'
import { ProjectScreen } from './features/workspace/components/ProjectScreen'
import { ConversationsScreen } from './features/workspace/components/ConversationsScreen'
import { ConversationScreen } from './features/workspace/components/ConversationScreen'
import { FilesScreen } from './features/workspace/components/FilesScreen'
import { VisualizerScreen } from './features/workspace/components/VisualizerScreen'
import { createMockWorkspaceService } from './features/workspace/services/mock-workspace-service'
import './App.css'

// [MODO DEMO / TEMPORAL] Servicios mock para visualizar la aplicación sin backend
const workspaceService = createMockWorkspaceService()
const settingsService = createMockSettingsService()

function UpcomingScreen({ heading }: { heading: string }) {
  return (
    <section>
      <h1>{heading}</h1>
      <p>Próximamente</p>
    </section>
  )
}

function App() {
  // [MODO DEMO / TEMPORAL] Sesión ficticia para visualizar la app sin login
  const session = {
    user: {
      id: 'demo-user-1',
      name: 'Antonio Demo',
      email: 'antonio@demo.local',
    },
    session: {
      id: 'session-demo',
      userId: 'demo-user-1',
      expiresAt: new Date(Date.now() + 86400000),
    },
  }
  const isPending = false
  // const { data: session, isPending } = authClient.useSession()

  async function handleSignOut() {
    const result = await authService.signOut()

    if (!result.ok) {
      throw new Error('message' in result ? (result as { message: string }).message : 'Error al cerrar sesión')
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
              workspaceService={workspaceService}
              userName={session.user.name}
            />
          }
        />
        <Route
          path="/settings/profile"
          element={
            <ProfileSettingsScreen
              onSignOut={handleSignOut}
              service={settingsService}
            />
          }
        />
        <Route
          path="/settings/models"
          element={
            <ModelSettingsScreen
              onSignOut={handleSignOut}
              service={settingsService}
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
          <Route path="/new" element={<NewRequestScreen service={workspaceService} />} />
          <Route path="/projects" element={<ProjectsScreen service={workspaceService} />} />
          <Route path="/projects/:projectId" element={<ProjectScreen service={workspaceService} />} />
          <Route path="/conversations" element={<ConversationsScreen service={workspaceService} />} />
          <Route path="/conversations/:conversationId" element={<ConversationScreen service={workspaceService} />} />
          <Route path="/files" element={<FilesScreen service={workspaceService} />} />
          <Route path="/executions" element={<UpcomingScreen heading="Ejecuciones" />} />
          <Route path="/visualizer" element={<VisualizerScreen service={workspaceService} />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
