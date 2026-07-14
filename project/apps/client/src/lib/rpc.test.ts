import { beforeEach, describe, expect, it, vi } from 'vitest'

const { hc } = vi.hoisted(() => ({
  hc: vi.fn(() => ({})),
}))

vi.mock('hono/client', () => ({ hc }))

describe('rpc client', () => {
  beforeEach(() => {
    vi.resetModules()
    hc.mockClear()
  })

  it('includes same-origin credentials in every request', async () => {
    await import('./rpc')

    expect(hc).toHaveBeenCalledWith('/', {
      init: { credentials: 'include' },
    })
  })
})
