import { describe, it, expect, vi } from 'vitest'
import { FakeMetaCache } from './FakeMetaCache.js'

describe('FakeMetaCache', () => {
  it('returns seeded frontmatter', () => {
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true, mood: 'okay' } }
    })
    expect(meta.getFrontmatter('/a.md')).toEqual({
      'notedrop-publish': true,
      mood: 'okay'
    })
  })

  it('returns null for unknown path', () => {
    expect(new FakeMetaCache({}).getFrontmatter('/missing.md')).toBeNull()
  })

  it('returns seeded headings or empty array', () => {
    const meta = new FakeMetaCache({
      '/a.md': { headings: [{ heading: 'Intro', level: 1 }] }
    })
    expect(meta.getHeadings('/a.md')).toEqual([{ heading: 'Intro', level: 1 }])
    expect(meta.getHeadings('/missing.md')).toEqual([])
  })

  it('returns seeded links or empty array', () => {
    const meta = new FakeMetaCache({
      '/a.md': { links: [{ link: 'B', displayText: 'see B' }] }
    })
    expect(meta.getLinks('/a.md')).toEqual([{ link: 'B', displayText: 'see B' }])
    expect(meta.getLinks('/missing.md')).toEqual([])
  })

  it('on() registers handler and fire() invokes it', () => {
    const meta = new FakeMetaCache({})
    const handler = vi.fn()
    meta.on('changed', handler)
    meta.fire('changed', '/a.md')
    expect(handler).toHaveBeenCalledWith('/a.md', undefined)
  })

  it('fire() includes oldPath for renamed', () => {
    const meta = new FakeMetaCache({})
    const handler = vi.fn()
    meta.on('renamed', handler)
    meta.fire('renamed', '/new.md', '/old.md')
    expect(handler).toHaveBeenCalledWith('/new.md', '/old.md')
  })

  it('on() returns an unsubscribe function', () => {
    const meta = new FakeMetaCache({})
    const handler = vi.fn()
    const off = meta.on('changed', handler)
    off()
    meta.fire('changed', '/a.md')
    expect(handler).not.toHaveBeenCalled()
  })

  it('multiple handlers per event are all invoked', () => {
    const meta = new FakeMetaCache({})
    const h1 = vi.fn()
    const h2 = vi.fn()
    meta.on('changed', h1)
    meta.on('changed', h2)
    meta.fire('changed', '/a.md')
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('events are isolated per type', () => {
    const meta = new FakeMetaCache({})
    const changedH = vi.fn()
    const deletedH = vi.fn()
    meta.on('changed', changedH)
    meta.on('deleted', deletedH)
    meta.fire('changed', '/a.md')
    expect(changedH).toHaveBeenCalledOnce()
    expect(deletedH).not.toHaveBeenCalled()
  })

  it('seed() updates frontmatter for an existing path', () => {
    const meta = new FakeMetaCache({ '/a.md': { frontmatter: { 'notedrop-publish': true } } })
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': false } })
    expect(meta.getFrontmatter('/a.md')).toEqual({ 'notedrop-publish': false })
  })

  it('forget() removes an entry', () => {
    const meta = new FakeMetaCache({ '/a.md': { frontmatter: {} } })
    meta.forget('/a.md')
    expect(meta.getFrontmatter('/a.md')).toBeNull()
  })
})
