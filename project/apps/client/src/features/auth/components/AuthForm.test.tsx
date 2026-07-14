import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthResult, AuthService } from '../model/auth-types'
import { AuthForm } from './AuthForm'

afterEach(cleanup)

function createService(): AuthService {
  return {
    signInWithEmail: vi.fn(async (): Promise<AuthResult> => ({ ok: true })),
    signUpWithEmail: vi.fn(async (): Promise<AuthResult> => ({ ok: true })),
    signInWithProvider: vi.fn(async (): Promise<AuthResult> => ({ ok: true })),
    signOut: vi.fn(async (): Promise<AuthResult> => ({ ok: true })),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

async function enterValidSignIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Correo electrónico'), 'ada@example.com')
  await user.type(screen.getByLabelText('Contraseña'), 'password123')
}

describe('AuthForm', () => {
  it('submits valid sign-in credentials once', async () => {
    const user = userEvent.setup()
    const service = createService()
    render(<AuthForm service={service} />)

    await enterValidSignIn(user)
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() => {
      expect(service.signInWithEmail).toHaveBeenCalledOnce()
    })
    expect(service.signInWithEmail).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'password123',
    })
  })

  it('reveals and validates the sign-up-only fields after resetting the form', async () => {
    const user = userEvent.setup()
    const service = createService()
    render(<AuthForm service={service} />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'old@example.com')
    await user.click(screen.getByRole('button', { name: 'Crear una cuenta' }))

    expect(screen.getByLabelText('Nombre')).toHaveValue('')
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('')
    expect(screen.getByLabelText('Confirmar contraseña')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Correo electrónico'), 'ada@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'password123')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'different123')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByText('Ingresa tu nombre.')).toBeInTheDocument()
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(service.signUpWithEmail).not.toHaveBeenCalled()
  })

  it('starts GitHub authentication from the GitHub provider button', async () => {
    const user = userEvent.setup()
    const service = createService()
    render(<AuthForm service={service} />)

    await user.click(screen.getByRole('button', { name: 'Continuar con GitHub' }))

    await waitFor(() => {
      expect(service.signInWithProvider).toHaveBeenCalledWith('github')
    })
  })

  it('announces a failed authentication result in a polite live region', async () => {
    const user = userEvent.setup()
    const service = createService()
    vi.mocked(service.signInWithEmail).mockResolvedValueOnce({
      ok: false,
      message: 'No pudimos iniciar sesión.',
    })
    render(<AuthForm service={service} />)

    await enterValidSignIn(user)
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('No pudimos iniciar sesión.')
  })

  it('disables every submission action and prevents double actions while pending', async () => {
    const user = userEvent.setup()
    const service = createService()
    const signIn = deferred<AuthResult>()
    vi.mocked(service.signInWithEmail).mockReturnValueOnce(signIn.promise)
    render(<AuthForm service={service} />)

    await enterValidSignIn(user)
    const submit = screen.getByRole('button', { name: 'Iniciar sesión' })
    await user.click(submit)

    await waitFor(() => expect(submit).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continuar con Microsoft' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continuar con GitHub' })).toBeDisabled()

    await user.click(submit)
    await user.click(screen.getByRole('button', { name: 'Continuar con GitHub' }))
    expect(service.signInWithEmail).toHaveBeenCalledOnce()
    expect(service.signInWithProvider).not.toHaveBeenCalled()

    signIn.resolve({ ok: true })
    await waitFor(() => expect(submit).toBeEnabled())
  })
})
