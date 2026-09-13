/**
 * In-memory query cache with TTL, in-flight promise deduplication, and pattern-based invalidation.
 */

type CacheEntry<T> = {
  data: T
  expiresAt: number
}

export type QueryCacheOptions = {
  ttlMs?: number
  bypassCache?: boolean
}

export class QueryCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private inFlight = new Map<string, Promise<unknown>>()

  /**
   * Fetches data with deduplication of concurrent requests and in-memory TTL caching.
   */
  async fetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: QueryCacheOptions = {},
  ): Promise<T> {
    const { ttlMs = 30_000, bypassCache = false } = options
    const now = Date.now()

    if (!bypassCache) {
      const cached = this.cache.get(key)
      if (cached && cached.expiresAt > now) {
        return cached.data as T
      }

      const pending = this.inFlight.get(key)
      if (pending) {
        return pending as Promise<T>
      }
    }

    const promise = (async () => {
      try {
        const data = await fetcher()
        this.cache.set(key, { data, expiresAt: Date.now() + ttlMs })
        return data
      } finally {
        this.inFlight.delete(key)
      }
    })()

    this.inFlight.set(key, promise)
    return promise
  }

  /**
   * Sets or pre-populates a cached value.
   */
  set<T>(key: string, data: T, ttlMs = 30_000): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs })
  }

  /**
   * Retrieves a cached value if valid.
   */
  get<T>(key: string): T | undefined {
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T
    }
    return undefined
  }

  /**
   * Invalidates one key, a prefix, or matching pattern.
   */
  invalidate(keyOrPrefix: string): void {
    for (const key of Array.from(this.cache.keys())) {
      if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}:`) || key.startsWith(`${keyOrPrefix}/`)) {
        this.cache.delete(key)
      }
    }
    for (const key of Array.from(this.inFlight.keys())) {
      if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}:`) || key.startsWith(`${keyOrPrefix}/`)) {
        this.inFlight.delete(key)
      }
    }
  }

  /**
   * Completely clears all cached items and in-flight promises.
   */
  clear(): void {
    this.cache.clear()
    this.inFlight.clear()
  }
}

export const globalQueryCache = new QueryCache()
