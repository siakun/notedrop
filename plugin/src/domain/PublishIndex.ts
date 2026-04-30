import { randomUUID } from 'node:crypto'
import type { VaultFs } from '../ports/VaultFs.js'
import type { MetaCache } from '../ports/MetaCache.js'
import type { PublishedItem, ChapterPlan } from './types.js'
import type { RenderMode } from '../types.js'

export type SeedEntry = {
  filePath: string
  hash: string
  publishedAt: string
  slug: string | null
}

export type IndexWarning = {
  filePath: string
  code: 'invalid-render' | 'slug-collision' | 'hash-collision'
  message: string
}

export type IndexEvent = 'added' | 'changed' | 'removed'
export type IndexEventHandler = (hash: string) => void

type BookAssemblerLike = {
  assemble(entryFilePath: string): Promise<ChapterPlan>
}

const VALID_RENDER: ReadonlySet<string> = new Set(['book', 'doc'])

export class PublishIndex {
  private byHash: Map<string, PublishedItem> = new Map()
  private pathToHash: Map<string, string> = new Map()
  private slugToHash: Map<string, string> = new Map()
  private seeds: Map<string, SeedEntry> = new Map()
  private listeners: Map<IndexEvent, Set<IndexEventHandler>> = new Map()
  warnings: IndexWarning[] = []

  constructor(private vault: VaultFs, private meta: MetaCache) {}

  seed(entries: SeedEntry[]): void {
    for (const e of entries) this.seeds.set(e.filePath, e)
  }

  on(event: IndexEvent, handler: IndexEventHandler): () => void {
    let set = this.listeners.get(event)
    if (!set) { set = new Set(); this.listeners.set(event, set) }
    set.add(handler)
    return () => { set!.delete(handler) }
  }

  private emit(event: IndexEvent, hash: string): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const handler of set) handler(hash)
  }

  /** External rebuild paths (e.g. dev sidecar) call build({bookAssembler}) for
   * authoritative state, then diff snapshots and dispatch synthetic events.
   * In-process upsert/remove/rename already emit internally — only use this
   * when bypassing those for full rebuild semantics. */
  dispatch(event: IndexEvent, hash: string): void {
    this.emit(event, hash)
  }

  async build(deps: { bookAssembler?: BookAssemblerLike } = {}): Promise<void> {
    this.byHash.clear()
    this.pathToHash.clear()
    this.slugToHash.clear()
    this.warnings = []

    const allFiles = await this.vault.listAllFiles()
    const now = new Date().toISOString()

    for (const filePath of allFiles) {
      if (!filePath.endsWith('.md')) continue
      const fm = this.meta.getFrontmatter(filePath)
      if (!fm || fm['notedrop-publish'] !== true) continue

      const item = this.deriveItem(filePath, fm, now)
      this.insert(item)
    }

    if (deps.bookAssembler) await this.linkBooks(deps.bookAssembler)
  }

  private async linkBooks(bookAssembler: BookAssemblerLike): Promise<void> {
    const entries = [...this.byHash.values()].filter((it) => it.render === 'book')
    for (const entry of entries) {
      const plan = await bookAssembler.assemble(entry.filePath)
      const linked: string[] = []
      for (const ch of plan.chapters) {
        const child = this.getByPath(ch.filePath)
        if (!child) continue
        const updated: PublishedItem = {
          ...child,
          type: 'chapter',
          parent: entry.hash,
          order: ch.order,
          section: deriveSection(entry.filePath, ch.filePath)
        }
        this.byHash.set(child.hash, updated)
        linked.push(child.hash)
      }
      this.byHash.set(entry.hash, { ...entry, chapters: linked })
    }
  }

  list(): PublishedItem[] {
    return [...this.byHash.values()]
  }

  get(hash: string): PublishedItem | null {
    return this.byHash.get(hash) ?? null
  }

  getByPath(filePath: string): PublishedItem | null {
    const hash = this.pathToHash.get(filePath)
    return hash ? (this.byHash.get(hash) ?? null) : null
  }

  getBySlug(slug: string): PublishedItem | null {
    const hash = this.slugToHash.get(slug)
    return hash ? (this.byHash.get(hash) ?? null) : null
  }

  listChildren(parentHash: string): PublishedItem[] {
    const out: PublishedItem[] = []
    for (const item of this.byHash.values()) {
      if (item.parent === parentHash) out.push(item)
    }
    out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    return out
  }

  upsert(filePath: string): PublishedItem | null {
    const fm = this.meta.getFrontmatter(filePath)
    if (!fm || fm['notedrop-publish'] !== true) {
      const removed = this.getByPath(filePath)
      if (removed) {
        this.detach(removed)
        this.emit('removed', removed.hash)
      }
      return null
    }
    const existing = this.getByPath(filePath)
    const now = new Date().toISOString()
    const draft = this.deriveItem(filePath, fm, now)
    const merged: PublishedItem = existing
      ? { ...draft, hash: existing.hash, publishedAt: existing.publishedAt }
      : draft
    if (existing) this.detach(existing)
    this.insert(merged)
    const stored = this.getByPath(filePath)!
    this.emit(existing ? 'changed' : 'added', stored.hash)
    return stored
  }

  remove(filePath: string): void {
    const existing = this.getByPath(filePath)
    if (!existing) return
    this.detach(existing)
    this.emit('removed', existing.hash)
  }

  rename(oldPath: string, newPath: string): void {
    const existing = this.getByPath(oldPath)
    if (!existing) return
    this.detach(existing)
    const renamed: PublishedItem = {
      ...existing,
      filePath: newPath,
      title: deriveTitle(newPath),
      updatedAt: new Date().toISOString()
    }
    this.insert(renamed)
    this.emit('changed', renamed.hash)
  }

  private detach(item: PublishedItem): void {
    this.byHash.delete(item.hash)
    this.pathToHash.delete(item.filePath)
    if (item.slug) this.slugToHash.delete(item.slug)
  }

  private deriveItem(
    filePath: string,
    fm: Record<string, unknown>,
    now: string
  ): PublishedItem {
    const seed = this.seeds.get(filePath)
    const hash = seed?.hash ?? this.newHash()
    const publishedAt = seed?.publishedAt ?? now
    const seedSlug = seed?.slug ?? null
    const fmSlug = typeof fm['notedrop-slug'] === 'string'
      ? (fm['notedrop-slug'] as string)
      : null
    const slug = fmSlug ?? seedSlug

    return {
      hash,
      slug,
      filePath,
      title: deriveTitle(filePath),
      render: this.resolveRender(filePath, fm),
      type: 'entry',
      parent: null,
      order: null,
      section: null,
      chapters: null,
      cover: typeof fm['notedrop-cover'] === 'string'
        ? (fm['notedrop-cover'] as string)
        : null,
      customCssRaw: {
        inline: typeof fm['notedrop-css'] === 'string'
          ? (fm['notedrop-css'] as string)
          : null,
        file: typeof fm['notedrop-css-file'] === 'string'
          ? (fm['notedrop-css-file'] as string)
          : null
      },
      publishedAt,
      updatedAt: now
    }
  }

  private resolveRender(
    filePath: string,
    fm: Record<string, unknown>
  ): RenderMode {
    const explicit = fm['notedrop-render']
    if (typeof explicit === 'string' && VALID_RENDER.has(explicit)) {
      return explicit as RenderMode
    }
    if (explicit !== undefined) {
      this.warnings.push({
        filePath,
        code: 'invalid-render',
        message: `notedrop-render must be 'book' or 'doc'; got ${JSON.stringify(explicit)}`
      })
    }
    return inferRender(filePath)
  }

  private insert(item: PublishedItem): void {
    if (this.byHash.has(item.hash)) {
      this.warnings.push({
        filePath: item.filePath,
        code: 'hash-collision',
        message: `regenerating hash for ${item.filePath}`
      })
      item = { ...item, hash: this.newHash() }
    }
    if (item.slug && this.slugToHash.has(item.slug)) {
      const dedup = this.dedupSlug(item.slug)
      this.warnings.push({
        filePath: item.filePath,
        code: 'slug-collision',
        message: `slug ${item.slug} already taken; using ${dedup}`
      })
      item = { ...item, slug: dedup }
    }
    this.byHash.set(item.hash, item)
    this.pathToHash.set(item.filePath, item.hash)
    if (item.slug) this.slugToHash.set(item.slug, item.hash)
  }

  private dedupSlug(slug: string): string {
    let n = 2
    while (this.slugToHash.has(`${slug}-${n}`)) n += 1
    return `${slug}-${n}`
  }

  private newHash(): string {
    let attempt = 0
    while (attempt < 4) {
      const candidate = randomUUID()
      if (!this.byHash.has(candidate)) return candidate
      attempt += 1
    }
    throw new Error('PublishIndex: hash regeneration exhausted (4 attempts)')
  }
}

function deriveTitle(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base.replace(/\.md$/, '')
}

/** chapter 의 직속 부모 폴더명을 entry 폴더 기준 상대 경로 첫 segment 로 반환.
 * entry filePath = '/A/B/A.md', chapter = '/A/B/Part 1/01.md' → 'Part 1'.
 * chapter 가 entry 와 같은 폴더면 null. */
function deriveSection(entryFilePath: string, chapterFilePath: string): string | null {
  const entrySegs = entryFilePath.split('/').filter(Boolean)
  const chapterSegs = chapterFilePath.split('/').filter(Boolean)
  // entry 의 마지막 segment (== entry .md) 제거 후 그 path 가 chapter path 의 prefix 인지
  const entryFolderSegs = entrySegs.slice(0, -1)
  for (let i = 0; i < entryFolderSegs.length; i++) {
    if (chapterSegs[i] !== entryFolderSegs[i]) return null
  }
  // chapter path 안 entry 폴더 다음 segment 가 sub-folder 면 그게 section. 직속이면 null.
  if (chapterSegs.length <= entryFolderSegs.length + 1) return null
  return chapterSegs[entryFolderSegs.length]!
}

function inferRender(filePath: string): RenderMode {
  const segs = filePath.split('/').filter(Boolean)
  const file = segs[segs.length - 1]
  const folder = segs[segs.length - 2]
  if (!file || !folder) return 'doc'
  return file.replace(/\.md$/, '') === folder ? 'book' : 'doc'
}
