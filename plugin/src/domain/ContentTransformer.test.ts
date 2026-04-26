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

describe('ContentTransformer.transform() - HIDE policy', () => {
  it('removes single-line %% comment %%', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'before %%hidden%% after',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('hidden')
    expect(r.markdown).not.toContain('%%')
    expect(r.markdown).toContain('before')
    expect(r.markdown).toContain('after')
  })

  it('removes multi-line %% comment %% spanning lines', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'one\n%%\nhidden\nstuff\n%%\ntwo',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('hidden')
    expect(r.markdown).not.toContain('stuff')
    expect(r.markdown).toContain('one')
    expect(r.markdown).toContain('two')
  })

  it('removes Waypoint block (%% Begin Waypoint %% ... %% End Waypoint %%)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'intro\n%% Begin Waypoint %%\n- [[ch1]]\n- [[ch2]]\n%% End Waypoint %%\noutro',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('Waypoint')
    expect(r.markdown).not.toContain('ch1')
    expect(r.markdown).not.toContain('ch2')
    expect(r.markdown).toContain('intro')
    expect(r.markdown).toContain('outro')
  })

  it('removes multiple %% blocks in one file', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: '%%a%% mid %%b%% end',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('%%')
    expect(r.markdown).not.toMatch(/\ba\b/)
    expect(r.markdown).not.toMatch(/\bb\b/)
    expect(r.markdown).toContain('mid')
    expect(r.markdown).toContain('end')
  })

  it('handles %% at the very start and end', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: '%%first%%body%%last%%',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('first')
    expect(r.markdown).not.toContain('last')
    expect(r.markdown).toContain('body')
  })

  it('does not strip text that merely contains %% in inline code', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: '`example: %%foo%%` and more',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('` and more')
  })

  it('frontmatter never appears in output body', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'body',
        fm: { 'notedrop-publish': true, 'mood': 'okay', 'source': 'private' }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('mood')
    expect(r.markdown).not.toContain('source')
    expect(r.markdown).not.toContain('private')
    expect(r.markdown).not.toContain('---')
  })
})

describe('ContentTransformer.transform() - wikilink safety', () => {
  it('published wikilink becomes markdown link to #/<slug>/', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'see [[Other]] here', fm: { 'notedrop-publish': true } },
      '/Other.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 'other-slug' }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('[Other](#/other-slug/)')
    expect(r.markdown).not.toContain('[[Other]]')
  })

  it('published wikilink with no slug uses hash', async () => {
    const { transformer, index } = await setup({
      '/a.md': { body: '[[Other]]', fm: { 'notedrop-publish': true } },
      '/Other.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const otherHash = index.getByPath('/Other.md')!.hash
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(`[Other](#/${otherHash}/)`)
  })

  it('published wikilink with alias renders alias as link text', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '[[Other|see this]]', fm: { 'notedrop-publish': true } },
      '/Other.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 'o' }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('[see this](#/o/)')
  })

  it('unpublished wikilink without alias becomes dead link with note name', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '[[Private]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(
      '<span class="notedrop-deadlink">Private(접근 권한이 없습니다)</span>'
    )
    expect(r.markdown).not.toContain('[[Private]]')
  })

  it('unpublished wikilink WITH alias renders alias only (no note name leak)', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '[[SecretNote|관련 메모]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('<span class="notedrop-deadlink">관련 메모</span>')
    expect(r.markdown).not.toContain('SecretNote')
  })

  it('multiple identical [[Note]] occurrences all get replaced', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: '[[Other]] and [[Other]] again',
        fm: { 'notedrop-publish': true }
      },
      '/Other.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 'o' }
      }
    })
    const r = await transformer.transform('/a.md')
    const occurrences = r.markdown.split('[Other](#/o/)').length - 1
    expect(occurrences).toBe(2)
  })

  it('alias-only safety net is exercised even on slug-less unpublished note', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '[[VerySecret|see ref]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('VerySecret')
    expect(r.markdown).toContain('see ref')
  })
})

describe('ContentTransformer.transform() - embed safety', () => {
  it('unpublished embed becomes placeholder block', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[Private]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(
      '<div class="notedrop-embed-placeholder">접근할 수 없는 문서: Private</div>'
    )
    expect(r.markdown).not.toContain('![[Private]]')
  })

  it('published embed inlines target body (frontmatter stripped)', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'pre ![[B]] post', fm: { 'notedrop-publish': true } },
      '/B.md': { body: 'inner content', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('inner content')
    expect(r.markdown).not.toContain('![[B]]')
    expect(r.markdown).toContain('pre ')
    expect(r.markdown).toContain(' post')
  })

  it('published embed runs HIDE on inner body before inlining', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[B]]', fm: { 'notedrop-publish': true } },
      '/B.md': {
        body: 'visible %%hidden%% rest',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('visible')
    expect(r.markdown).toContain('rest')
    expect(r.markdown).not.toContain('hidden')
  })

  it('embed inside an embedded note becomes depth-overflow placeholder', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[B]]', fm: { 'notedrop-publish': true } },
      '/B.md': {
        body: 'before ![[C]] after',
        fm: { 'notedrop-publish': true }
      },
      '/C.md': { body: 'C body', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(
      '<div class="notedrop-embed-overflow">(임베드 깊이 초과)</div>'
    )
    expect(r.markdown).not.toContain('C body')
  })

  it('depth-overflow applies to unpublished inner embeds too', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[B]]', fm: { 'notedrop-publish': true } },
      '/B.md': { body: '![[Private]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('notedrop-embed-overflow')
    expect(r.markdown).not.toContain('Private')
  })

  it('inner wikilinks of an embedded body still get safety net', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[B]]', fm: { 'notedrop-publish': true } },
      '/B.md': { body: '[[Private]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('notedrop-deadlink')
    expect(r.markdown).not.toContain('[[Private]]')
  })

  it('cyclic embed A -> B -> A is broken at depth limit', async () => {
    const { transformer } = await setup({
      '/A.md': { body: 'one ![[B]] two', fm: { 'notedrop-publish': true } },
      '/B.md': { body: '![[A]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/A.md')
    expect(r.markdown).toContain('notedrop-embed-overflow')
    expect(r.markdown).toContain('one ')
    expect(r.markdown).toContain(' two')
  })
})

describe('ContentTransformer.transform() - images', () => {
  it('image embed becomes absolute <img> with owner hash', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[cover.png]]',
      '/img/cover.png': 'PNGBYTES'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const item = index.getByPath('/a.md')!
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index, vault)
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(
      `<img src="/content/${item.hash}/_assets/cover.png" alt="">`
    )
  })

  it('image with width pipe gets width attribute', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[c.png|400]]',
      '/c.png': 'X'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const item = index.getByPath('/a.md')!
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index, vault)
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(
      `<img src="/content/${item.hash}/_assets/c.png" alt="" width="400">`
    )
  })

  it('image with widthxheight gets both attributes', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[c.png|400x300]]',
      '/c.png': 'X'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index, vault)
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(`width="400"`)
    expect(r.markdown).toContain(`height="300"`)
  })

  it('image push assetRef with vaultPath, outputPath, mime, size', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[c.png]]',
      '/c.png': 'PNGBYTES'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const item = index.getByPath('/a.md')!
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index, vault)
    const r = await transformer.transform('/a.md')
    expect(r.assetRefs).toHaveLength(1)
    expect(r.assetRefs[0]).toEqual({
      vaultPath: '/c.png',
      outputPath: `/content/${item.hash}/_assets/c.png`,
      size: 'PNGBYTES'.length,
      mime: 'image/png'
    })
  })

  it('broken image becomes placeholder + warning', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[missing.png]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('[이미지 누락: missing.png]')
    expect(r.markdown).not.toContain('![[missing.png]]')
    expect(r.warnings.some((w) => w.includes('missing.png'))).toBe(true)
    expect(r.assetRefs).toEqual([])
  })

  it('multiple images all absolutized and tracked', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[x.png]] ![[y.jpg]]',
      '/x.png': 'X',
      '/y.jpg': 'Y'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index, vault)
    const r = await transformer.transform('/a.md')
    expect(r.assetRefs.map((a) => a.vaultPath).sort()).toEqual(['/x.png', '/y.jpg'])
  })
})

describe('ContentTransformer.transform() - cover', () => {
  it('absolutizes cover vault path to /content/<hash>/_assets/<file>', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '---\nnotedrop-publish: true\nnotedrop-render: book\nnotedrop-cover: "_assets/cover.png"\n---\nbody',
      '/books/B/_assets/cover.png': 'PNG'
    })
    const meta = new FakeMetaCache({
      '/books/B/B.md': {
        frontmatter: {
          'notedrop-publish': true,
          'notedrop-render': 'book',
          'notedrop-cover': '_assets/cover.png'
        }
      }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const item = index.getByPath('/books/B/B.md')!
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index, vault)
    const r = await transformer.transform('/books/B/B.md')
    expect(r.outputFrontmatter.cover).toBe(`/content/${item.hash}/_assets/cover.png`)
    expect(r.assetRefs.find((a) => a.vaultPath === '/books/B/_assets/cover.png')).toBeDefined()
  })

  it('cover null when notedrop-cover absent', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.cover).toBeNull()
  })

  it('cover not found in vault -> null + warning', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\nnotedrop-cover: "missing.png"\n---'
    })
    const meta = new FakeMetaCache({
      '/a.md': {
        frontmatter: { 'notedrop-publish': true, 'notedrop-cover': 'missing.png' }
      }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index, vault)
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.cover).toBeNull()
    expect(r.warnings.some((w) => w.includes('cover'))).toBe(true)
  })
})

describe('ContentTransformer.transform() - customCss', () => {
  it('inline notedrop-css populates customCss', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-css': '.page { color: red; }' }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).toContain('.page { color: red; }')
  })

  it('file css is read and appended after inline', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\nnotedrop-css: ".inline { color: red; }"\nnotedrop-css-file: "styles/book.css"\n---',
      '/styles/book.css': '.file { color: blue; }'
    })
    const meta = new FakeMetaCache({
      '/a.md': {
        frontmatter: {
          'notedrop-publish': true,
          'notedrop-css': '.inline { color: red; }',
          'notedrop-css-file': 'styles/book.css'
        }
      }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index, vault)
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).toContain('.inline { color: red; }')
    expect(r.outputFrontmatter.customCss).toContain('.file { color: blue; }')
    const inlinePos = r.outputFrontmatter.customCss!.indexOf('.inline')
    const filePos = r.outputFrontmatter.customCss!.indexOf('.file')
    expect(inlinePos).toBeLessThan(filePos)
  })

  it('missing css file -> warning, customCss falls back to inline only', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: {
          'notedrop-publish': true,
          'notedrop-css': '.x {}',
          'notedrop-css-file': 'nope.css'
        }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).toContain('.x {}')
    expect(r.outputFrontmatter.customCss).not.toContain('nope.css')
    expect(r.warnings.some((w) => w.includes('nope.css'))).toBe(true)
  })

  it('strips @import lines (CSS sanitize)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: {
          'notedrop-publish': true,
          'notedrop-css': '@import "evil.css";\n.ok { color: red; }'
        }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).not.toContain('@import')
    expect(r.outputFrontmatter.customCss).toContain('.ok { color: red; }')
  })

  it('strips url(http*) (CSS sanitize)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: {
          'notedrop-publish': true,
          'notedrop-css': '.x { background: url(https://evil.com/track.png); }'
        }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).not.toContain('https://evil.com')
  })

  it('strips expression() (CSS sanitize)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: {
          'notedrop-publish': true,
          'notedrop-css': '.x { width: expression(alert(1)); }'
        }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).not.toContain('expression(')
  })

  it('customCss null when neither key set', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).toBeNull()
  })
})
