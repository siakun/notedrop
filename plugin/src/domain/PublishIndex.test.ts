import { describe, it, expect, beforeEach } from 'vitest'
import { PublishIndex } from './PublishIndex.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

const HASH_RE = /^[0-9a-f]{32}$/

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

  it('generates a 32-char hex hash for each new note', async () => {
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
