import { describe, expect, it, vi } from 'vitest'

import { createAuthService } from './auth-service'

type ClientResult = {
  error?: unknown
}

function createClient() {
  return {
    signIn: {
      email: vi
        .fn<(input: unknown) => Promise<ClientResult>>()
        .mockResolvedValue({ error: null }),
      social: vi
        .fn<(input: unknown) => Promise<ClientResult>>()
        .mockResolvedValue({ error: null }),
    },
    signUp: {
      email: vi
        .fn<(input: unknown) => Promise<ClientResult>>()
        .mockResolvedValue({ error: null }),
    },
    signOut: vi.fn(async (): Promise<ClientResult> => ({ error: null })),
  }
}

describe('createAuthService', () => {
  it('forwards email sign-in credentials to Better Auth', async () => {
    const client = createClient()
    const service = createAuthService(client)

    const result = await service.signInWithEmail({
      email: 'ada@example.com',
      password: 'password123',
    })

    expect(client.signIn.email).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'password123',
    })
    expect(result).toEqual({ ok: true })
  })

  it('forwards email sign-up details to Better Auth', async () => {
    const client = createClient()
    const service = createAuthService(client)

    const result = await service.signUpWithEmail({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
    })

    expect(client.signUp.email).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
    })
    expect(result).toEqual({ ok: true })
  })

  it('forwards the selected provider with the same-origin callback', async () => {
    const client = createClient()
    const service = createAuthService(client)

    const result = await service.signInWithProvider('github')

    expect(client.signIn.social).toHaveBeenCalledWith({
      provider: 'github',
      callbackURL: '/',
    })
    expect(result).toEqual({ ok: true })
  })

  it('delegates sign-out to Better Auth', async () => {
    const client = createClient()
    const service = createAuthService(client)

    const result = await service.signOut()

    expect(client.signOut).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: true })
  })

  it('replaces raw sign-in errors with a safe message', async () => {
    const client = createClient()
    client.signIn.email.mockResolvedValueOnce({
      error: {
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Account ada@example.com does not exist',
      },
    })
    const service = createAuthService(client)

    const result = await service.signInWithEmail({
      email: 'ada@example.com',
      password: 'password123',
    })

    expect(result).toEqual({
      ok: false,
      message: 'No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.',
    })
    expect(JSON.stringify(result)).not.toContain('ada@example.com')
    expect(JSON.stringify(result)).not.toContain('INVALID_EMAIL_OR_PASSWORD')
  })

  it.each([
    {
      operation: 'sign-up',
      invoke: (client: ReturnType<typeof createClient>) =>
        createAuthService(client).signUpWithEmail({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'password123',
        }),
      fail: (client: ReturnType<typeof createClient>) =>
        client.signUp.email.mockResolvedValueOnce({ error: { code: 'USER_ALREADY_EXISTS' } }),
      message: 'No pudimos crear tu cuenta. Revisa tus datos e inténtalo de nuevo.',
    },
    {
      operation: 'social sign-in',
      invoke: (client: ReturnType<typeof createClient>) =>
        createAuthService(client).signInWithProvider('google'),
      fail: (client: ReturnType<typeof createClient>) =>
        client.signIn.social.mockResolvedValueOnce({ error: { code: 'PROVIDER_NOT_FOUND' } }),
      message: 'Este proveedor no está disponible por el momento. Inténtalo de nuevo más tarde.',
    },
    {
      operation: 'sign-out',
      invoke: (client: ReturnType<typeof createClient>) => createAuthService(client).signOut(),
      fail: (client: ReturnType<typeof createClient>) =>
        client.signOut.mockRejectedValueOnce(new Error('raw session token failure')),
      message: 'No pudimos cerrar sesión. Inténtalo de nuevo.',
    },
  ])('returns a safe message when $operation fails', async ({ fail, invoke, message }) => {
    const client = createClient()
    fail(client)

    await expect(invoke(client)).resolves.toEqual({ ok: false, message })
  })
})
