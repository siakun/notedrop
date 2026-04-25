import type {
  MetaCache,
  CacheHeading,
  CacheLink,
  CacheEvent,
  CacheEventHandler
} from '../ports/MetaCache.js'

export type FakeMetaCacheEntry = {
  frontmatter?: Record<string, unknown>
  headings?: CacheHeading[]
  links?: CacheLink[]
}

export class FakeMetaCache implements MetaCache {
  private entries: Map<string, FakeMetaCacheEntry>
  private handlers: Map<CacheEvent, Set<CacheEventHandler>>

  constructor(initial: Record<string, FakeMetaCacheEntry> = {}) {
    this.entries = new Map(Object.entries(initial))
    this.handlers = new Map()
  }

  getFrontmatter(path: string): Record<string, unknown> | null {
    const entry = this.entries.get(path)
    return entry?.frontmatter ?? null
  }

  getHeadings(path: string): CacheHeading[] {
    return this.entries.get(path)?.headings ?? []
  }

  getLinks(path: string): CacheLink[] {
    return this.entries.get(path)?.links ?? []
  }

  on(event: CacheEvent, handler: CacheEventHandler): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler)
    return () => { set!.delete(handler) }
  }

  fire(event: CacheEvent, path: string, oldPath?: string): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of set) handler(path, oldPath)
  }

  seed(path: string, entry: FakeMetaCacheEntry): void {
    this.entries.set(path, entry)
  }

  forget(path: string): void {
    this.entries.delete(path)
  }
}
