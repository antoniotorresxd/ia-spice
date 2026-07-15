import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const authClientMocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  useSession: vi.fn(),
}))

vi.mock('better-auth/react', () => ({
  createAuthClient: () => authClientMocks,
}))

import App from './App'

const session = {
  session: {
    id: 'session-1',
    createdAt: new Date('2026-07-13T12:00:00Z'),
    updatedAt: new Date('2026-07-13T12:00:00Z'),
    userId: 'user-1',
    expiresAt: new Date('2026-07-14T12:00:00Z'),
    token: 'session-token',
    ipAddress: null,
    userAgent: null,
  },
  user: {
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date('2026-07-13T12:00:00Z'),
    updatedAt: new Date('2026-07-13T12:00:00Z'),
  },
}

function setSessionState({
  data,
  isPending = false,
}: {
  data: typeof session | null
  isPending?: boolean
}) {
  authClientMocks.useSession.mockReturnValue({
    data,
    error: null,
    isPending,
    isRefetching: false,
    refetch: vi.fn(),
  })
}

beforeEach(() => {
  window.history.pushState({}, '', '/')
  authClientMocks.useSession.mockReset()
  authClientMocks.signOut.mockReset()
  authClientMocks.signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('shows a busy preparation state while the session is pending', () => {
  setSessionState({ data: null, isPending: true })

  render(<App />)

  expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByText('Preparando tu espacio…')).toBeVisible()
})

it('shows the real authentication experience without a session', () => {
  setSessionState({ data: null })

  render(<App />)

  expect(
    screen.getByRole('region', { name: 'Acceso a SPICE' }),
  ).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
})

it('shows the Ecosistema Multiagente home with a session', async () => {
  const user = userEvent.setup()
  setSessionState({ data: session })

  render(<App />)

  expect(await screen.findByText('Ecosistema Multiagente')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Perfil de Ada Lovelace' }))
  expect(screen.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'Sesión activa' }),
  ).not.toBeInTheDocument()
})

it.each([
  ['/settings/profile', 'Tu perfil'],
  ['/settings/models', 'Modelos y providers'],
])('renders %s for authenticated users', async (path, heading) => {
  window.history.pushState({}, '', path)
  setSessionState({ data: session })

  render(<App />)

  expect(await screen.findByRole('heading', { name: heading })).toBeVisible()
})

it.each([
  ['/new', 'Nueva solicitud'],
  ['/projects', 'Proyectos'],
  ['/projects/project-filters', 'Detalle del proyecto'],
  ['/conversations', 'Conversaciones'],
  ['/conversations/conversation-filter', 'Detalle de la conversación'],
])('renders workspace route %s for authenticated users', async (path, heading) => {
  window.history.pushState({}, '', path)
  setSessionState({ data: session })

  render(<App />)

  expect(await screen.findByRole('heading', { name: heading })).toBeVisible()
  expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
})

it('redirects unknown authenticated routes home', async () => {
  window.history.pushState({}, '', '/unknown')
  setSessionState({ data: session })

  render(<App />)

  expect(
    await screen.findByRole('heading', { name: /buenos días/i }),
  ).toBeVisible()
})

it('delegates sign-out through the authentication service', async () => {
  const user = userEvent.setup()
  setSessionState({ data: session })

  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Perfil de Ada Lovelace' }))
  await user.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }))

  expect(authClientMocks.signOut).toHaveBeenCalledOnce()
})

it('shows a safe inline error when sign-out fails', async () => {
  const user = userEvent.setup()
  authClientMocks.signOut.mockRejectedValueOnce(
    new Error('raw session token failure'),
  )
  setSessionState({ data: session })

  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Perfil de Ada Lovelace' }))
  await user.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }))

  expect(
    await screen.findByText('No pudimos cerrar sesión. Inténtalo de nuevo.'),
  ).toBeVisible()
  expect(screen.queryByText(/raw session token failure/i)).not.toBeInTheDocument()
})
