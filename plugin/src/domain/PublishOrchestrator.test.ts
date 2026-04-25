import { describe, it, expect, beforeEach } from 'vitest'
import { PublishOrchestrator } from './PublishOrchestrator.js'
import { PublishIndex } from './PublishIndex.js'
import { ContentResolver } from './ContentResolver.js'
import { ContentTransformer } from './ContentTransformer.js'
import { ManifestBuilder } from './ManifestBuilder.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

describe('PublishOrchestrator', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache
  let index: PublishIndex
  let orchestrator: PublishOrchestrator

  beforeEach(async () => {
    vault = new InMemoryVaultFs({
      'doc-a.md': '---\nnotedrop-publish: true\n---\n# Doc A\n\nbody A',
      'doc-b.md': '---\nnotedrop-publish: true\n---\n# Doc B\n\nbody B'
    })
    meta = new FakeMetaCache({
      'doc-a.md': { frontmatter: { 'notedrop-publish': true } },
      'doc-b.md': { frontmatter: { 'notedrop-publish': true } }
    })
    index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const transformer = new ContentTransformer(resolver, index, vault)
    const manifestBuilder = new ManifestBuilder(index)
    orchestrator = new PublishOrchestrator(
      vault,
      index,
      transformer,
      manifestBuilder,
      { generatedBy: 'test', publicRoot: 'viewer/public' }
    )
  })

  it('각 published item 마다 index.md 파일 + manifest.json 생성', async () => {
    const plan = await orchestrator.plan()
    const textFiles = plan.files.filter((f) => f.kind === 'text')
    expect(textFiles.length).toBe(3)
    expect(textFiles.some((f) => f.path === 'viewer/public/manifest.json')).toBe(true)
    const indexes = textFiles.filter((f) => f.path.endsWith('/index.md'))
    expect(indexes.length).toBe(2)
  })

  it('각 페이지에 frontmatter + 본문 포함', async () => {
    const plan = await orchestrator.plan()
    const page = plan.files.find((f) => f.kind === 'text' && f.path.endsWith('/index.md'))
    expect(page).toBeDefined()
    expect(page!.kind === 'text' && page!.content.startsWith('---\n')).toBe(true)
  })

  it('manifest 에 모든 published item 등록', async () => {
    const plan = await orchestrator.plan()
    expect(plan.manifest.items.length).toBe(2)
    expect(plan.manifest.generatedBy).toBe('test')
  })

  it('publicRoot 옵션으로 경로 prefix 변경', async () => {
    const o2 = new PublishOrchestrator(
      vault,
      index,
      new ContentTransformer(new ContentResolver(vault, meta, index), index, vault),
      new ManifestBuilder(index),
      { publicRoot: 'docs' }
    )
    const plan = await o2.plan()
    expect(plan.files.every((f) => f.path.startsWith('docs/'))).toBe(true)
  })

  it('hash 기반 디렉터리 경로', async () => {
    const plan = await orchestrator.plan()
    const indexes = plan.files
      .filter((f) => f.kind === 'text' && f.path.endsWith('/index.md'))
      .map((f) => f.path)
    for (const path of indexes) {
      expect(path).toMatch(/^viewer\/public\/content\/[a-f0-9]{32}\/index\.md$/)
    }
  })
})
