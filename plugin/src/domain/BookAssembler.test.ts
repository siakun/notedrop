import { describe, it, expect } from 'vitest'
import { BookAssembler } from './BookAssembler.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

describe('BookAssembler.assemble', () => {
  it('extracts chapters from a Waypoint block in entry file', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '# Title\n%% Begin Waypoint %%\n- [[01. one]]\n- [[02. two]]\n%% End Waypoint %%\n',
      '/books/B/01. one.md': '',
      '/books/B/02. two.md': ''
    })
    const meta = new FakeMetaCache({})
    const a = new BookAssembler(vault, meta)
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.source).toBe('waypoint')
    expect(plan.chapters).toEqual([
      { filePath: '/books/B/01. one.md', order: 1 },
      { filePath: '/books/B/02. two.md', order: 2 }
    ])
  })

  it('falls back to MOC.md when no Waypoint block', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '# Title',
      '/books/B/MOC.md': '- [[01. one]]\n- [[02. two]]',
      '/books/B/01. one.md': '',
      '/books/B/02. two.md': ''
    })
    const meta = new FakeMetaCache({})
    const a = new BookAssembler(vault, meta)
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.source).toBe('moc')
    expect(plan.chapters.map((c) => c.filePath)).toEqual([
      '/books/B/01. one.md',
      '/books/B/02. two.md'
    ])
  })

  it('falls back to folder-scan when no Waypoint and no MOC', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/01.md': '',
      '/books/B/02.md': '',
      '/books/B/03.md': ''
    })
    const meta = new FakeMetaCache({})
    const a = new BookAssembler(vault, meta)
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.source).toBe('folder-scan')
    expect(plan.chapters.map((c) => c.filePath)).toEqual([
      '/books/B/01.md',
      '/books/B/02.md',
      '/books/B/03.md'
    ])
  })

  it('folder-scan excludes _-prefixed and .-prefixed files', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/_draft.md': '',
      '/books/B/.hidden.md': '',
      '/books/B/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters.map((c) => c.filePath)).toEqual(['/books/B/01.md'])
  })

  it('folder-scan excludes CLAUDE.md, MOC.md, entry file, 원본매핑.md', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/CLAUDE.md': '',
      '/books/B/MOC.md': '',
      '/books/B/원본매핑.md': '',
      '/books/B/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters.map((c) => c.filePath)).toEqual(['/books/B/01.md'])
  })

  it('folder-scan natural order (numeric prefix sorted correctly)', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/02.md': '',
      '/books/B/10.md': '',
      '/books/B/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters.map((c) => c.filePath)).toEqual([
      '/books/B/01.md',
      '/books/B/02.md',
      '/books/B/10.md'
    ])
  })

  it('Waypoint with no inner wikilinks falls back to MOC then folder-scan', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '%% Begin Waypoint %%\n%% End Waypoint %%',
      '/books/B/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.source).toBe('folder-scan')
    expect(plan.chapters.map((c) => c.filePath)).toEqual(['/books/B/01.md'])
  })

  it('MOC with no wikilinks falls back to folder-scan', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/MOC.md': '# Empty TOC\n\nno links here',
      '/books/B/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.source).toBe('folder-scan')
  })

  it('returns empty chapters when folder is empty', async () => {
    const vault = new InMemoryVaultFs({ '/books/B/B.md': '' })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters).toEqual([])
  })

  it('order is 1-based and sequential', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/a.md': '',
      '/books/B/b.md': '',
      '/books/B/c.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters.map((c) => c.order)).toEqual([1, 2, 3])
  })

  it('Waypoint resolves wikilinks against entry folder + vault search', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '%% Begin Waypoint %%\n- [[01]]\n%% End Waypoint %%',
      '/books/B/Part 1/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters[0]!.filePath).toBe('/books/B/Part 1/01.md')
  })
})
