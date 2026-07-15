import { AuthScreen } from './features/auth/components/AuthScreen'
import { authClient } from './features/auth/services/auth-client'
import { authService } from './features/auth/services/auth-service'
import { HomeScreen } from './features/home/components/HomeScreen'
import { mockHomeService } from './features/home/services/mock-home-service'
import './App.css'

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
    <HomeScreen
      onSignOut={handleSignOut}
      service={mockHomeService}
      userName={session.user.name}
    />
  )
}

export default App
