import type { MetaCache } from '../ports/MetaCache.js'
import type { PublishIndex } from '../domain/PublishIndex.js'

type Pending =
  | { kind: 'upsert'; path: string }
  | { kind: 'remove'; path: string }
  | { kind: 'rename'; path: string; oldPath: string }

export type VaultEventBridgeOptions = {
  debounceMs?: number
}

export class VaultEventBridge {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private pending = new Map<string, Pending>()
  private unsubscribers: Array<() => void> = []
  private readonly debounceMs: number

  constructor(
    private meta: MetaCache,
    private index: PublishIndex,
    options: VaultEventBridgeOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? 200
  }

  start(): void {
    if (this.unsubscribers.length > 0) return
    this.unsubscribers.push(
      this.meta.on('changed', (path) => {
        this.schedule(path, { kind: 'upsert', path })
      })
    )
    this.unsubscribers.push(
      this.meta.on('deleted', (path) => {
        this.schedule(path, { kind: 'remove', path })
      })
    )
    this.unsubscribers.push(
      this.meta.on('renamed', (newPath, oldPath) => {
        if (!oldPath) return
        this.schedule(newPath, { kind: 'rename', path: newPath, oldPath })
      })
    )
  }

  stop(): void {
    for (const u of this.unsubscribers) u()
    this.unsubscribers = []
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
    this.pending.clear()
  }

  flushAll(): void {
    const keys = [...this.timers.keys()]
    for (const key of keys) {
      const t = this.timers.get(key)
      if (t) clearTimeout(t)
      this.flush(key)
    }
  }

  private schedule(key: string, payload: Pending): void {
    const existing = this.timers.get(key)
    if (existing) clearTimeout(existing)
    this.pending.set(key, payload)
    const timer = setTimeout(() => {
      this.flush(key)
    }, this.debounceMs)
    this.timers.set(key, timer)
  }

  private flush(key: string): void {
    const payload = this.pending.get(key)
    this.pending.delete(key)
    this.timers.delete(key)
    if (!payload) return
    if (payload.kind === 'upsert') {
      this.index.upsert(payload.path)
    } else if (payload.kind === 'remove') {
      this.index.remove(payload.path)
    } else {
      this.index.rename(payload.oldPath, payload.path)
    }
  }
}
