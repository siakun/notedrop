import { describe, it, expect } from 'vitest'
import { ContentTransformer } from './ContentTransformer.js'
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
  const resolver = new ContentResolver(vault, meta, index)
  return {
    vault,
    meta,
    index,
    transformer: new ContentTransformer(resolver, index, vault)
  }
}

describe('ContentTransformer.transform() - frontmatter', () => {
  it('outputs PageFrontmatter using PublishedItem identity fields', async () => {
    const { transformer, index } = await setup({
      '/a.md': {
        body: 'hello',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 'mine' }
      }
    })
    const item = index.getByPath('/a.md')!
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.hash).toBe(item.hash)
    expect(r.outputFrontmatter.slug).toBe('mine')
    expect(r.outputFrontmatter.title).toBe('a')
    expect(r.outputFrontmatter.render).toBe(item.render)
    expect(r.outputFrontmatter.type).toBe(item.type)
    expect(r.outputFrontmatter.publishedAt).toBe(item.publishedAt)
    expect(r.outputFrontmatter.updatedAt).toBe(item.updatedAt)
  })

  it('drops every vault frontmatter key not in PageFrontmatter (safety)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: {
          'notedrop-publish': true,
          mood: 'sad',
          tags: ['private', 'diary'],
          summary: 'secret summary',
          source: 'private notes'
        }
      }
    })
    const r = await transformer.transform('/a.md')
    const out = r.outputFrontmatter as unknown as Record<string, unknown>
    expect(out.mood).toBeUndefined()
    expect(out.tags).toBeUndefined()
    expect(out.summary).toBeUndefined()
    expect(out.source).toBeUndefined()
  })

  it('outputFrontmatter has exactly the 11 PageFrontmatter keys (and no more)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 's', 'mood': 'okay' }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(Object.keys(r.outputFrontmatter).sort()).toEqual([
      'cover',
      'customCss',
      'hash',
      'order',
      'parent',
      'publishedAt',
      'render',
      'slug',
      'title',
      'type',
      'updatedAt'
    ])
  })

  it('throws when the file is not in PublishIndex', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: {} }
    })
    await expect(transformer.transform('/a.md')).rejects.toThrow(/not in index/i)
  })

  it('returns the body without frontmatter as initial markdown', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: '# Title\n\nbody',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown.startsWith('# Title')).toBe(true)
    expect(r.markdown).not.toContain('---')
  })

  it('cover is null when notedrop-cover absent', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.cover).toBeNull()
  })

  it('customCss is null when neither notedrop-css nor notedrop-css-file given', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).toBeNull()
  })

  it('warnings array is empty for a clean file', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.warnings).toEqual([])
  })

  it('assetRefs is empty when no images', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.assetRefs).toEqual([])
  })
})
