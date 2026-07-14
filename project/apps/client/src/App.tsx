import { useState } from 'react'

import { AuthScreen } from './features/auth/components/AuthScreen'
import { authClient } from './features/auth/services/auth-client'
import { authService } from './features/auth/services/auth-service'
import './App.css'

function App() {
  const { data: session, isPending } = authClient.useSession()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function handleSignOut() {
    setIsSigningOut(true)
    setSignOutError(null)

    const result = await authService.signOut()

    if (!result.ok) {
      setSignOutError(result.message)
    }

    setIsSigningOut(false)
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
    <main className="app-session-gate">
      <section aria-labelledby="session-title" className="app-session-card">
        <p className="app-session-eyebrow">SPICE</p>
        <h1 id="session-title">Sesión activa</h1>
        <p className="app-session-copy">Tu espacio está listo para continuar.</p>
        <p className="app-session-user">{session.user.name}</p>
        <button
          className="app-session-button"
          disabled={isSigningOut}
          onClick={handleSignOut}
          type="button"
        >
          {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
        {signOutError ? (
          <p className="app-session-error" role="alert">
            {signOutError}
          </p>
        ) : null}
      </section>
    </main>
  )
}

export default App
