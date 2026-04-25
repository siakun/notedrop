import { randomUUID } from 'node:crypto'
import type { VaultFs } from '../ports/VaultFs.js'
import type { MetaCache } from '../ports/MetaCache.js'
import type { PublishedItem } from './types.js'
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

const VALID_RENDER: ReadonlySet<string> = new Set(['book', 'doc'])

export class PublishIndex {
  private byHash: Map<string, PublishedItem> = new Map()
  private pathToHash: Map<string, string> = new Map()
  private slugToHash: Map<string, string> = new Map()
  private seeds: Map<string, SeedEntry> = new Map()
  warnings: IndexWarning[] = []

  constructor(private vault: VaultFs, private meta: MetaCache) {}

  seed(entries: SeedEntry[]): void {
    for (const e of entries) this.seeds.set(e.filePath, e)
  }

  async build(): Promise<void> {
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
      const candidate = randomUUID().replace(/-/g, '')
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

function inferRender(filePath: string): RenderMode {
  const segs = filePath.split('/').filter(Boolean)
  const file = segs[segs.length - 1]
  const folder = segs[segs.length - 2]
  if (!file || !folder) return 'doc'
  return file.replace(/\.md$/, '') === folder ? 'book' : 'doc'
}
