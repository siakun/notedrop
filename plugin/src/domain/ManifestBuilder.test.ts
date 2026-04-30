import { describe, it, expect, beforeEach } from 'vitest'
import { ManifestBuilder } from './ManifestBuilder.js'
import { PublishIndex } from './PublishIndex.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

describe('ManifestBuilder.build()', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache
  let index: PublishIndex

  beforeEach(async () => {
    vault = new InMemoryVaultFs({})
    meta = new FakeMetaCache({})
    await vault.writeFile('/books/B/B.md', '')
    await vault.writeFile('/notes/solo.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: {
        'notedrop-publish': true,
        'notedrop-render': 'book',
        'notedrop-slug': 'b'
      }
    })
    meta.seed('/notes/solo.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-cover': 'thumb.png' }
    })
    index = new PublishIndex(vault, meta)
    await index.build()
  })

  it('returns Manifest with version 1', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'notedrop-plugin@0.1.0' })
    expect(m.version).toBe(1)
  })

  it('generatedBy reflects option', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'tool@1.2' })
    expect(m.generatedBy).toBe('tool@1.2')
  })

  it('generatedAt is an ISO timestamp', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    expect(() => new Date(m.generatedAt).toISOString()).not.toThrow()
  })

  it('items length equals index size', () => {
    const builder = new ManifestBuilder(index)
    expect(builder.build({ generatedBy: 'x' }).items).toHaveLength(2)
  })

  it('drops PublishedItem.filePath from output', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    for (const item of m.items) {
      expect((item as Record<string, unknown>).filePath).toBeUndefined()
    }
  })

  it('drops PublishedItem.customCssRaw from output', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    for (const item of m.items) {
      expect((item as Record<string, unknown>).customCssRaw).toBeUndefined()
    }
  })

  it('emits ManifestItem with exactly the 11 spec keys', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    expect(Object.keys(m.items[0]!).sort()).toEqual([
      'chapters',
      'cover',
      'hash',
      'order',
      'parent',
      'render',
      'section',
      'slug',
      'title',
      'type',
      'updatedAt'
    ])
  })

  it('cover passes through (raw vault path is intentional, M4 publish replaces)', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    const solo = m.items.find((it) => it.title === 'solo')!
    expect(solo.cover).toBe('thumb.png')
  })

  it('chapters array preserved when present', async () => {
    await vault.writeFile('/books/B/01.md', '')
    meta.seed('/books/B/01.md', { frontmatter: { 'notedrop-publish': true } })
    index.upsert('/books/B/01.md')
    const entry = index.getByPath('/books/B/B.md')!
    const ch = index.getByPath('/books/B/01.md')!
    ;(index as unknown as {
      byHash: Map<string, import('./types.js').PublishedItem>
    }).byHash.set(entry.hash, { ...entry, chapters: [ch.hash] })
    ;(index as unknown as {
      byHash: Map<string, import('./types.js').PublishedItem>
    }).byHash.set(ch.hash, { ...ch, type: 'chapter', parent: entry.hash, order: 1 })

    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    const entryItem = m.items.find((it) => it.hash === entry.hash)!
    expect(entryItem.chapters).toEqual([ch.hash])
    const chItem = m.items.find((it) => it.hash === ch.hash)!
    expect(chItem.chapters).toBeNull()
    expect(chItem.parent).toBe(entry.hash)
    expect(chItem.section).toBeNull()
  })

  it('items sorted: entries first then chapters by parent+order', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    expect(m.items[0]!.type).toBe('entry')
  })
})
