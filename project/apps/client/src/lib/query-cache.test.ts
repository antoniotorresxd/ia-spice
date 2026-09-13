import { describe, expect, it, vi } from 'vitest'
import { QueryCache } from './query-cache'

describe('QueryCache', () => {
  it('deduplicates concurrent in-flight requests to the same key', async () => {
    const cache = new QueryCache()
    const fetcher = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20))
      return { id: 1, name: 'Circuit' }
    })

    const [p1, p2, p3] = await Promise.all([
      cache.fetch('test-key', fetcher),
      cache.fetch('test-key', fetcher),
      cache.fetch('test-key', fetcher),
    ])

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(p1).toEqual({ id: 1, name: 'Circuit' })
    expect(p2).toEqual({ id: 1, name: 'Circuit' })
    expect(p3).toEqual({ id: 1, name: 'Circuit' })
  })

  it('serves cached data while within TTL without calling fetcher again', async () => {
    const cache = new QueryCache()
    const fetcher = vi.fn().mockResolvedValue('fresh')

    const first = await cache.fetch('key-1', fetcher, { ttlMs: 1000 })
    const second = await cache.fetch('key-1', fetcher, { ttlMs: 1000 })

    expect(first).toBe('fresh')
    expect(second).toBe('fresh')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('invalidates matching keys on demand', async () => {
    const cache = new QueryCache()
    const fetcher = vi.fn().mockResolvedValue('data')

    await cache.fetch('workspace:snapshot', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)

    cache.invalidate('workspace:snapshot')

    await cache.fetch('workspace:snapshot', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('invalidates prefixed keys', async () => {
    const cache = new QueryCache()
    const fetcher = vi.fn().mockResolvedValue('data')

    await cache.fetch('settings:connection-models:conn-1', fetcher)
    await cache.fetch('settings:connection-models:conn-2', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)

    cache.invalidate('settings:connection-models')

    await cache.fetch('settings:connection-models:conn-1', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('bypasses cache when bypassCache is true', async () => {
    const cache = new QueryCache()
    const fetcher = vi.fn().mockResolvedValue('data')

    await cache.fetch('key-1', fetcher)
    await cache.fetch('key-1', fetcher, { bypassCache: true })

    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
