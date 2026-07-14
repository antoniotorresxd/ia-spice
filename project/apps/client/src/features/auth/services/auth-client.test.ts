import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.fn(() => ({}))

vi.mock('better-auth/react', () => ({ createAuthClient }))

describe('auth client configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    createAuthClient.mockClear()
  })

  it('uses the configured API origin', async () => {
    vi.stubEnv('VITE_API_URL', 'https://server.example.com')

    await import('./auth-client')

    expect(createAuthClient).toHaveBeenCalledWith({
      baseURL: 'https://server.example.com',
    })
  })
})
