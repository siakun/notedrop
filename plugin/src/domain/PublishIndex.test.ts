import { describe, it, expect, beforeEach } from 'vitest'
import { PublishIndex } from './PublishIndex.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

const HASH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('PublishIndex.build()', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache

  beforeEach(() => {
    vault = new InMemoryVaultFs({})
    meta = new FakeMetaCache({})
  })

  it('returns empty catalog for empty vault', async () => {
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()).toEqual([])
  })

  it('picks up notes with notedrop-publish: true', async () => {
    await vault.writeFile('/notes/a.md', '---\nnotedrop-publish: true\n---\nbody')
    meta.seed('/notes/a.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()).toHaveLength(1)
  })

  it('ignores notes without notedrop-publish', async () => {
    await vault.writeFile('/notes/a.md', '---\n---\nbody')
    meta.seed('/notes/a.md', { frontmatter: {} })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()).toEqual([])
  })

  it('ignores notes where notedrop-publish is false', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': false } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()).toEqual([])
  })

  it('ignores non-.md files', async () => {
    await vault.writeFile('/img.png', 'PNG')
    meta.seed('/img.png', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()).toEqual([])
  })

  it('generates a dashed UUID hash for each new note', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    const item = idx.list()[0]!
    expect(item.hash).toMatch(HASH_RE)
  })

  it('derives title from filename without extension', async () => {
    await vault.writeFile('/notes/01. 환경 준비.md', '')
    meta.seed('/notes/01. 환경 준비.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.title).toBe('01. 환경 준비')
  })

  it('reads slug from notedrop-slug', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'my-post' }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.slug).toBe('my-post')
  })

  it('slug is null when notedrop-slug missing', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.slug).toBeNull()
  })

  it('reads explicit notedrop-render: doc', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'doc' }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.render).toBe('doc')
  })

  it('reads explicit notedrop-render: book', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'book' }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.render).toBe('book')
  })

  it('falls back to render=book when folder name matches file basename (Waypoint)', async () => {
    await vault.writeFile('/books/My Book/My Book.md', '')
    meta.seed('/books/My Book/My Book.md', {
      frontmatter: { 'notedrop-publish': true }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.render).toBe('book')
  })

  it('falls back to render=doc when folder name does not match', async () => {
    await vault.writeFile('/notes/random.md', '')
    meta.seed('/notes/random.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.render).toBe('doc')
  })

  it('warns and falls back when notedrop-render value is invalid', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'weird' }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.render).toBe('doc')
    expect(idx.warnings).toContainEqual(
      expect.objectContaining({ filePath: '/a.md', code: 'invalid-render' })
    )
  })

  it('initial type is always entry; chapters get linked later', async () => {
    await vault.writeFile('/books/B/B.md', '')
    await vault.writeFile('/books/B/01.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'book' }
    })
    meta.seed('/books/B/01.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list().every((it) => it.type === 'entry')).toBe(true)
  })

  it('stores cover as raw vault path from notedrop-cover', async () => {
    await vault.writeFile('/books/B/B.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: {
        'notedrop-publish': true,
        'notedrop-render': 'book',
        'notedrop-cover': '_assets/cover.png'
      }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.cover).toBe('_assets/cover.png')
  })

  it('stores customCssRaw with inline and file separately', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: {
        'notedrop-publish': true,
        'notedrop-css': '.page { color: red; }',
        'notedrop-css-file': 'styles/book.css'
      }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.customCssRaw).toEqual({
      inline: '.page { color: red; }',
      file: 'styles/book.css'
    })
  })

  it('sets publishedAt and updatedAt to ISO strings on first build', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    const item = idx.list()[0]!
    expect(() => new Date(item.publishedAt).toISOString()).not.toThrow()
    expect(item.updatedAt).toBe(item.publishedAt)
  })

  it('seed() preserves hash and publishedAt across builds', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    idx.seed([
      {
        filePath: '/a.md',
        hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        publishedAt: '2026-01-01T00:00:00.000Z',
        slug: null
      }
    ])
    await idx.build()
    const item = idx.list()[0]!
    expect(item.hash).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(item.publishedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('PublishIndex.query', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache
  let idx: PublishIndex

  beforeEach(async () => {
    vault = new InMemoryVaultFs({})
    meta = new FakeMetaCache({})
    await vault.writeFile('/books/B/B.md', '')
    await vault.writeFile('/books/B/01.md', '')
    await vault.writeFile('/notes/solo.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: {
        'notedrop-publish': true,
        'notedrop-render': 'book',
        'notedrop-slug': 'b'
      }
    })
    meta.seed('/books/B/01.md', {
      frontmatter: { 'notedrop-publish': true }
    })
    meta.seed('/notes/solo.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'solo' }
    })
    idx = new PublishIndex(vault, meta)
    await idx.build()
  })

  it('get(hash) returns item by hash', () => {
    const all = idx.list()
    const item = all[0]!
    expect(idx.get(item.hash)).toEqual(item)
  })

  it('get(hash) returns null for unknown hash', () => {
    expect(idx.get('00000000000000000000000000000000')).toBeNull()
  })

  it('getByPath returns item by file path', () => {
    expect(idx.getByPath('/notes/solo.md')?.slug).toBe('solo')
  })

  it('getByPath returns null for unknown path', () => {
    expect(idx.getByPath('/missing.md')).toBeNull()
  })

  it('getBySlug returns item by slug', () => {
    expect(idx.getBySlug('b')?.filePath).toBe('/books/B/B.md')
  })

  it('getBySlug returns null for unknown slug', () => {
    expect(idx.getBySlug('nope')).toBeNull()
  })

  it('list() returns all items', () => {
    expect(idx.list()).toHaveLength(3)
  })

  it('listChildren returns items whose parent matches the given hash', () => {
    const bookHash = idx.getByPath('/books/B/B.md')!.hash
    expect(idx.listChildren(bookHash)).toEqual([])
  })
})

describe('PublishIndex.mutations', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache
  let idx: PublishIndex

  beforeEach(async () => {
    vault = new InMemoryVaultFs({})
    meta = new FakeMetaCache({})
    idx = new PublishIndex(vault, meta)
    await idx.build()
  })

  it('upsert returns null when frontmatter has no publish flag', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: {} })
    expect(idx.upsert('/a.md')).toBeNull()
  })

  it('upsert inserts a new item when publish flag is true', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const item = idx.upsert('/a.md')
    expect(item).not.toBeNull()
    expect(idx.list()).toHaveLength(1)
  })

  it('upsert preserves hash and publishedAt on update', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const first = idx.upsert('/a.md')!
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'changed' }
    })
    const second = idx.upsert('/a.md')!
    expect(second.hash).toBe(first.hash)
    expect(second.publishedAt).toBe(first.publishedAt)
    expect(second.slug).toBe('changed')
  })

  it('upsert refreshes updatedAt', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const first = idx.upsert('/a.md')!
    await new Promise((r) => setTimeout(r, 5))
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const second = idx.upsert('/a.md')!
    expect(second.updatedAt >= first.updatedAt).toBe(true)
  })

  it('upsert returns null and removes item when publish flag flips false', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const item = idx.upsert('/a.md')!
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': false } })
    expect(idx.upsert('/a.md')).toBeNull()
    expect(idx.get(item.hash)).toBeNull()
  })

  it('remove deletes by file path', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    idx.upsert('/a.md')
    idx.remove('/a.md')
    expect(idx.getByPath('/a.md')).toBeNull()
    expect(idx.list()).toEqual([])
  })

  it('remove is a no-op for unknown path', () => {
    expect(() => idx.remove('/missing.md')).not.toThrow()
  })

  it('rename keeps hash, updates path mapping', async () => {
    await vault.writeFile('/old.md', '')
    meta.seed('/old.md', { frontmatter: { 'notedrop-publish': true } })
    const item = idx.upsert('/old.md')!
    idx.rename('/old.md', '/new.md')
    expect(idx.getByPath('/old.md')).toBeNull()
    const moved = idx.getByPath('/new.md')
    expect(moved?.hash).toBe(item.hash)
    expect(moved?.filePath).toBe('/new.md')
    expect(moved?.title).toBe('new')
  })

  it('rename emits changed event with same hash', async () => {
    await vault.writeFile('/old2.md', '')
    meta.seed('/old2.md', { frontmatter: { 'notedrop-publish': true } })
    await idx.build()
    const item = idx.getByPath('/old2.md')!
    const calls: string[] = []
    idx.on('changed', (h) => calls.push(h))
    idx.rename('/old2.md', '/renamed2.md')
    expect(calls).toEqual([item.hash])
  })

  it('rename is a no-op when oldPath unknown', () => {
    expect(() => idx.rename('/nope.md', '/new.md')).not.toThrow()
    expect(idx.getByPath('/new.md')).toBeNull()
  })

  it('slug collision on upsert appends -2', async () => {
    await vault.writeFile('/a.md', '')
    await vault.writeFile('/b.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'foo' }
    })
    meta.seed('/b.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'foo' }
    })
    idx.upsert('/a.md')
    const second = idx.upsert('/b.md')!
    expect(second.slug).toBe('foo-2')
    expect(idx.warnings).toContainEqual(
      expect.objectContaining({ code: 'slug-collision' })
    )
  })

  it('upsert frees old slug when slug changes', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'old' }
    })
    idx.upsert('/a.md')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'new' }
    })
    idx.upsert('/a.md')
    expect(idx.getBySlug('old')).toBeNull()
    expect(idx.getBySlug('new')).not.toBeNull()
  })
})

import type { ChapterPlan } from './types.js'

class StubBookAssembler {
  constructor(private plans: Map<string, ChapterPlan>) {}
  async assemble(entryFilePath: string): Promise<ChapterPlan> {
    return this.plans.get(entryFilePath) ?? { source: 'folder-scan' as const, chapters: [] }
  }
}

describe('PublishIndex.events', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache
  let idx: PublishIndex

  beforeEach(async () => {
    vault = new InMemoryVaultFs({})
    meta = new FakeMetaCache({})
    idx = new PublishIndex(vault, meta)
    await idx.build()
  })

  it('emits "added" on first upsert', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const seen: string[] = []
    idx.on('added', (h) => { seen.push(h) })
    const item = idx.upsert('/a.md')!
    expect(seen).toEqual([item.hash])
  })

  it('emits "changed" on update upsert', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const item = idx.upsert('/a.md')!
    const seen: string[] = []
    idx.on('changed', (h) => { seen.push(h) })
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'x' } })
    idx.upsert('/a.md')
    expect(seen).toEqual([item.hash])
  })

  it('emits "removed" on remove', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const item = idx.upsert('/a.md')!
    const seen: string[] = []
    idx.on('removed', (h) => { seen.push(h) })
    idx.remove('/a.md')
    expect(seen).toEqual([item.hash])
  })

  it('on() unsubscribe stops further notifications', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const seen: string[] = []
    const off = idx.on('added', (h) => { seen.push(h) })
    off()
    idx.upsert('/a.md')
    expect(seen).toEqual([])
  })
})

describe('PublishIndex book linking', () => {
  it('linkBooks wires parent/chapters/order for book entries', async () => {
    const vault = new InMemoryVaultFs({})
    const meta = new FakeMetaCache({})
    await vault.writeFile('/books/B/B.md', '')
    await vault.writeFile('/books/B/01.md', '')
    await vault.writeFile('/books/B/02.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'book' }
    })
    meta.seed('/books/B/01.md', { frontmatter: { 'notedrop-publish': true } })
    meta.seed('/books/B/02.md', { frontmatter: { 'notedrop-publish': true } })

    const idx = new PublishIndex(vault, meta)
    const stub = new StubBookAssembler(new Map([
      ['/books/B/B.md', {
        source: 'folder-scan' as const,
        chapters: [
          { filePath: '/books/B/01.md', order: 1 },
          { filePath: '/books/B/02.md', order: 2 }
        ]
      }]
    ]))

    await idx.build({ bookAssembler: stub })

    const entry = idx.getByPath('/books/B/B.md')!
    const ch1 = idx.getByPath('/books/B/01.md')!
    const ch2 = idx.getByPath('/books/B/02.md')!

    expect(entry.type).toBe('entry')
    expect(entry.chapters).toEqual([ch1.hash, ch2.hash])
    expect(ch1.type).toBe('chapter')
    expect(ch1.parent).toBe(entry.hash)
    expect(ch1.order).toBe(1)
    expect(idx.listChildren(entry.hash).map((it) => it.hash)).toEqual([
      ch1.hash, ch2.hash
    ])
  })

  it('linkBooks ignores chapter paths not in the index', async () => {
    const vault = new InMemoryVaultFs({})
    const meta = new FakeMetaCache({})
    await vault.writeFile('/books/B/B.md', '')
    await vault.writeFile('/books/B/01.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'book' }
    })
    meta.seed('/books/B/01.md', { frontmatter: { 'notedrop-publish': true } })

    const idx = new PublishIndex(vault, meta)
    const stub = new StubBookAssembler(new Map([
      ['/books/B/B.md', {
        source: 'folder-scan' as const,
        chapters: [
          { filePath: '/books/B/01.md', order: 1 },
          { filePath: '/books/B/missing.md', order: 2 }
        ]
      }]
    ]))

    await idx.build({ bookAssembler: stub })

    const entry = idx.getByPath('/books/B/B.md')!
    expect(entry.chapters).toHaveLength(1)
  })
})
