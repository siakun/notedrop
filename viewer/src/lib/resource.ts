/**
 * keyed cache + invalidate + subscribe + inflight dedup 추상화.
 *
 * manifestClient (singleton key) + contentClient (hash key 다수) 가 동일
 * 패턴이라 추출. 향후 신규 리소스 (검색 인덱스 등) 추가 시 코드 양 절감.
 *
 * @example
 *   const manifest = new Resource<Manifest>(
 *     async () => fetchManifestFromUrl()
 *   )
 *   await manifest.get('singleton')
 *   manifest.invalidate('singleton')
 *
 *   const content = new Resource<PageContent>(
 *     async (hash) => fetchContentFromUrl(hash)
 *   )
 *   await content.get(noteHash)
 *   content.invalidate(noteHash)
 */
export class Resource<T> {
  private readonly cache = new Map<string, T>()
  private readonly inflight = new Map<string, Promise<T>>()
  private readonly subscribers = new Set<(key: string) => void>()

  constructor(private readonly fetcher: (key: string) => Promise<T>) {}

  /**
   * cache hit 시 즉시 반환. miss 시 fetcher 호출, 같은 key 의 동시 fetch 는
   * 단일 Promise 로 dedup. force=true 면 cache 우회.
   */
  async get(key: string, force = false): Promise<T> {
    if (!force) {
      const cached = this.cache.get(key)
      if (cached !== undefined) return cached
      const pending = this.inflight.get(key)
      if (pending) return pending
    }
    const promise = this.fetcher(key)
      .then((value) => {
        this.cache.set(key, value)
        return value
      })
      .finally(() => {
        this.inflight.delete(key)
      })
    this.inflight.set(key, promise)
    return promise
  }

  /** key 의 cache 만 무효화. subscribers 알림. */
  invalidate(key: string): void {
    this.cache.delete(key)
    for (const fn of this.subscribers) {
      try { fn(key) } catch {}
    }
  }

  /** 모든 key 의 cache 무효화. 각 key 별로 subscribers 알림. */
  invalidateAll(): void {
    const keys = Array.from(this.cache.keys())
    this.cache.clear()
    for (const fn of this.subscribers) {
      for (const key of keys) {
        try { fn(key) } catch {}
      }
    }
  }

  /**
   * 임의의 key 가 invalidate 되면 호출되는 callback 등록. unsubscribe fn 반환.
   */
  subscribe(fn: (key: string) => void): () => void {
    this.subscribers.add(fn)
    return () => {
      this.subscribers.delete(fn)
    }
  }

  /** 현재 cache 의 key 값을 동기 read (없으면 null). useState initial 에 사용. */
  peek(key: string): T | null {
    return this.cache.get(key) ?? null
  }
}
