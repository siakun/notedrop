import { describe, it, expect } from 'vitest'
import { ContentResolver } from './ContentResolver.js'
import { PublishIndex } from './PublishIndex.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

async function setup(files: Record<string, { body: string, fm?: Record<string, unknown> }>) {
  const vault = new InMemoryVaultFs({})
  const meta = new FakeMetaCache({})
  for (const [path, { body, fm }] of Object.entries(files)) {
    const yaml = fm
      ? `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n`
      : ''
    await vault.writeFile(path, yaml + body)
    meta.seed(path, { frontmatter: fm ?? {} })
  }
  const index = new PublishIndex(vault, meta)
  await index.build()
  return { vault, meta, index, resolver: new ContentResolver(vault, meta, index) }
}

describe('ContentResolver.resolve()', () => {
  it('returns rawMarkdown unchanged', async () => {
    const { resolver } = await setup({
      '/a.md': {
        body: '# Title\n\nbody text',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.rawMarkdown).toContain('---\n')
    expect(r.rawMarkdown).toContain('# Title')
    expect(r.rawMarkdown).toContain('body text')
  })

  it('parses frontmatter via metadataCache', async () => {
    const { resolver } = await setup({
      '/a.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 's', 'mood': 'okay' }
      }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.frontmatter).toMatchObject({
      'notedrop-publish': true,
      'notedrop-slug': 's',
      mood: 'okay'
    })
  })

  it('returns empty refs when body has no links', async () => {
    const { resolver } = await setup({
      '/a.md': { body: 'just text', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs).toEqual([])
  })

  it('extracts a plain wikilink', async () => {
    const { resolver } = await setup({
      '/a.md': {
        body: 'see [[Other]] please',
        fm: { 'notedrop-publish': true }
      },
      '/Other.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs).toHaveLength(1)
    const ref = r.refs[0]!
    expect(ref.type).toBe('wikilink')
    expect(ref.target).toBe('Other')
    expect(ref.rawText).toBe('[[Other]]')
    expect(ref.resolution.kind).toBe('published-note')
  })

  it('classifies wikilink to unpublished note as unpublished-note', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '[[Private]]', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.resolution).toEqual({
      kind: 'unpublished-note',
      noteName: 'Private'
    })
  })

  it('parses alias from [[Note|alias]]', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '[[Other|see this]]', fm: { 'notedrop-publish': true } },
      '/Other.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.alias).toBe('see this')
  })

  it('parses anchor from [[Note#Heading]]', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '[[Other#Intro]]', fm: { 'notedrop-publish': true } },
      '/Other.md': { body: '', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.anchor).toBe('Intro')
    expect(r.refs[0]!.target).toBe('Other')
  })

  it('parses blockId from [[Note#^block]]', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '[[Other#^abc123]]', fm: { 'notedrop-publish': true } },
      '/Other.md': { body: '', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.blockId).toBe('abc123')
    expect(r.refs[0]!.anchor).toBeUndefined()
  })

  it('extracts an embed via ![[Note]]', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '![[Other]]', fm: { 'notedrop-publish': true } },
      '/Other.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.type).toBe('embed')
    expect(r.refs[0]!.rawText).toBe('![[Other]]')
  })

  it('classifies ![[file.png]] as image and finds vault path', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[cover.png]]',
      '/img/cover.png': 'PNG'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.type).toBe('image')
    expect(r.refs[0]!.resolution).toEqual({
      kind: 'image',
      vaultPath: '/img/cover.png',
      mime: 'image/png'
    })
  })

  it('parses size pipe ![[img.png|400]]', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[img.png|400]]',
      '/img.png': 'PNG'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.size).toEqual({ width: 400 })
  })

  it('parses size pipe ![[img.png|400x300]]', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[img.png|400x300]]',
      '/img.png': 'PNG'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.size).toEqual({ width: 400, height: 300 })
  })

  it('classifies missing image as broken', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '![[missing.png]]', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.type).toBe('image')
    expect(r.refs[0]!.resolution.kind).toBe('broken')
  })

  it('chooses first match when multiple images share filename', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[shared.png]]',
      '/folder1/shared.png': 'A',
      '/folder2/shared.png': 'B'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    const res = r.refs[0]!.resolution
    expect(res.kind === 'image' && res.vaultPath.endsWith('/shared.png')).toBe(true)
  })

  it('detects mime by extension (jpg, jpeg, svg, webp, gif)', async () => {
    const cases: Array<[string, string]> = [
      ['photo.jpg', 'image/jpeg'],
      ['photo.jpeg', 'image/jpeg'],
      ['icon.svg', 'image/svg+xml'],
      ['anim.gif', 'image/gif'],
      ['mod.webp', 'image/webp']
    ]
    for (const [file, mime] of cases) {
      const vault = new InMemoryVaultFs({
        '/a.md': `---\nnotedrop-publish: true\n---\n![[${file}]]`,
        [`/${file}`]: 'X'
      })
      const meta = new FakeMetaCache({
        '/a.md': { frontmatter: { 'notedrop-publish': true } }
      })
      const index = new PublishIndex(vault, meta)
      await index.build()
      const resolver = new ContentResolver(vault, meta, index)
      const r = await resolver.resolve('/a.md')
      const res = r.refs[0]!.resolution
      expect(res.kind === 'image' && res.mime === mime).toBe(true)
    }
  })

  it('extracts multiple refs in one body in source order', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\nfirst [[X]] then ![[Y]] then [[Z]]',
      '/X.md': '',
      '/Y.md': '',
      '/Z.md': ''
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } },
      '/X.md': { frontmatter: { 'notedrop-publish': true } },
      '/Y.md': { frontmatter: { 'notedrop-publish': true } },
      '/Z.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    expect(r.refs.map((ref) => ref.target)).toEqual(['X', 'Y', 'Z'])
    expect(r.refs.map((ref) => ref.type)).toEqual(['wikilink', 'embed', 'wikilink'])
  })

  it('skips wikilinks inside %% comments %%', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\nbody %%[[Hidden]]%% [[Visible]]',
      '/Hidden.md': '',
      '/Visible.md': ''
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } },
      '/Hidden.md': { frontmatter: { 'notedrop-publish': true } },
      '/Visible.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    expect(r.refs.map((ref) => ref.target)).toEqual(['Visible'])
  })
})
