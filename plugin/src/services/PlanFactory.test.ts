import { describe, it, expect, beforeEach, vi } from 'vitest'

// PlanFactory 가 import 시점에 viewer.fingerprint.txt 를 const 로 등록.
// fresh checkout 또는 빌드 안 한 상태면 빈 문자열이라 cache hit 분기 비활성.
// 테스트는 fixed fingerprint 로 cache 동작 검증.
vi.mock('../embedded/viewer.fingerprint.txt', () => ({
  default: 'test-fingerprint-12345'
}))

// viewer.zip.b64 도 fixed (빈) 으로 등록 — 단위 테스트가 빌드 산출물 의존
// 안 하도록. 빈 zip 시 collectViewerFiles 가 .nojekyll 1개만 반환 (현재
// 동작). cache miss 테스트는 .nojekyll 등록으로 검증.
vi.mock('../embedded/viewer.zip.b64', () => ({ default: '' }))

import {
  buildViewerCacheKey,
  collectViewerFiles,
  createPlanFactory,
  deriveRepoSegment,
  isViewerAssetPath,
  VIEWER_FINGERPRINT
} from './PlanFactory.js'
import { PublishIndex } from '../domain/PublishIndex.js'
import { ContentResolver } from '../domain/ContentResolver.js'
import { ContentTransformer } from '../domain/ContentTransformer.js'
import { ManifestBuilder } from '../domain/ManifestBuilder.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'
import {
  DEFAULT_SETTINGS,
  type PluginSettings
} from '../settings/PluginSettings.js'

describe('PlanFactory 순수 함수', () => {
  describe('isViewerAssetPath', () => {
    it('publicRoot="" 의 manifest.json 은 viewer 자산 아님', () => {
      expect(isViewerAssetPath('manifest.json', '')).toBe(false)
    })
    it('publicRoot="" 의 content/x/index.md 는 viewer 자산 아님', () => {
      expect(isViewerAssetPath('content/abc/index.md', '')).toBe(false)
    })
    it('publicRoot="" 의 _next/static/chunk.js 는 viewer 자산', () => {
      expect(isViewerAssetPath('_next/static/chunk.js', '')).toBe(true)
    })
    it('publicRoot="" 의 .nojekyll 은 viewer 자산 분류', () => {
      expect(isViewerAssetPath('.nojekyll', '')).toBe(true)
    })
    it('publicRoot="docs" 면 prefix 적용 후 분류', () => {
      expect(isViewerAssetPath('docs/manifest.json', 'docs')).toBe(false)
      expect(isViewerAssetPath('docs/content/x/index.md', 'docs')).toBe(false)
      expect(isViewerAssetPath('docs/_next/foo.js', 'docs')).toBe(true)
    })
    it('prefix 미일치 path 는 viewer 자산 분류 X (sanity)', () => {
      // 다른 publicRoot 의 잔재가 baseline 에 있어도 misclassify 안 함
      expect(isViewerAssetPath('other/foo.js', 'docs')).toBe(false)
    })
  })

  describe('buildViewerCacheKey', () => {
    it('fingerprint + publicRoot + repoSegment 모두 포함', () => {
      const key = buildViewerCacheKey('abc123', '', 'notedrop-share')
      expect(key).toContain('abc123')
      expect(key).toContain('notedrop-share')
    })
    it('publicRoot 다르면 키 다름', () => {
      const a = buildViewerCacheKey('fp', '', 'repo')
      const b = buildViewerCacheKey('fp', 'docs', 'repo')
      expect(a).not.toBe(b)
    })
    it('repoSegment 다르면 키 다름', () => {
      const a = buildViewerCacheKey('fp', '', 'repo-a')
      const b = buildViewerCacheKey('fp', '', 'repo-b')
      expect(a).not.toBe(b)
    })
  })

  describe('deriveRepoSegment', () => {
    it('일반 repo → repo 이름', () => {
      expect(deriveRepoSegment('siakun/notedrop-share')).toBe('notedrop-share')
    })
    it('user page → 빈 문자열', () => {
      expect(deriveRepoSegment('siakun/siakun.github.io')).toBe('')
    })
    it('잘못된 형식 → 빈 문자열', () => {
      expect(deriveRepoSegment('invalid')).toBe('')
      expect(deriveRepoSegment('a/b/c')).toBe('')
    })
  })

  describe('collectViewerFiles', () => {
    it('publicRoot="" 시 .nojekyll 은 prefix 없이', () => {
      const files = collectViewerFiles('', 'notedrop-share')
      expect(files.some((f) => f.path === '.nojekyll')).toBe(true)
    })
    it('publicRoot="docs" 시 .nojekyll 은 docs/ prefix', () => {
      const files = collectViewerFiles('docs', 'notedrop-share')
      expect(files.some((f) => f.path === 'docs/.nojekyll')).toBe(true)
    })
  })
})

describe('createPlanFactory cache 분기', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache
  let index: PublishIndex
  let transformer: ContentTransformer
  let manifestBuilder: ManifestBuilder
  let settings: PluginSettings

  beforeEach(async () => {
    vault = new InMemoryVaultFs({
      'doc-a.md': '---\nnotedrop-publish: true\n---\n# Doc A\n\nbody'
    })
    meta = new FakeMetaCache({
      'doc-a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    transformer = new ContentTransformer(resolver, index, vault)
    manifestBuilder = new ManifestBuilder(index)
    settings = {
      ...DEFAULT_SETTINGS,
      targetRepo: 'siakun/notedrop-share',
      publicRoot: '',
      publishViewerAssets: true
    }
  })

  it('publishViewerAssets=false → viewerCacheKey null + viewer 자산 entry 0', async () => {
    settings.publishViewerAssets = false
    const factory = createPlanFactory(
      { vault, index, transformer, manifestBuilder },
      settings
    )
    const plan = await factory()
    expect(plan.viewerCacheKey).toBeNull()
    expect(plan.viewerCacheHit).toBe(false)
    // viewer 자산 (.nojekyll 등) 은 publishViewerAssets=false 일 때 0
    expect(plan.files.every((f) => !f.path.endsWith('.nojekyll'))).toBe(true)
  })

  it('cache miss (lastViewerCacheKey null) → viewerCacheHit=false + 전체 unpack', async () => {
    settings.lastViewerCacheKey = null
    settings.lastPublishedFiles = null
    const factory = createPlanFactory(
      { vault, index, transformer, manifestBuilder },
      settings
    )
    const plan = await factory()
    expect(plan.viewerCacheHit).toBe(false)
    expect(plan.viewerCacheKey).not.toBeNull()
    // .nojekyll 가 cache miss 시 plan.files 에 존재 (text kind, content "")
    const nojekyll = plan.files.find((f) => f.path.endsWith('.nojekyll'))
    expect(nojekyll).toBeDefined()
    expect(nojekyll!.kind).toBe('text')
    // cached entry 0
    expect(plan.files.filter((f) => f.kind === 'cached').length).toBe(0)
  })

  it('cache hit → cached entry 존재 + collectViewerFiles 호출 안 됨', async () => {
    const segment = 'notedrop-share'
    const cacheKey = buildViewerCacheKey(VIEWER_FINGERPRINT, '', segment)
    settings.lastViewerCacheKey = cacheKey
    settings.lastPublishedFiles = {
      // viewer 자산 path (.nojekyll, _next/x.js) baseline 에 존재
      '.nojekyll': { hash: 'h-nojekyll', text: '' },
      '_next/static/chunk.js': { hash: 'h-chunk', text: 'console.log(1)' },
      // 사용자 manifest + content (cached entry 로 안 존재 — orchestrator 가
      // 매번 fresh 등록)
      'manifest.json': { hash: 'h-manifest', text: '{"v":1}' },
      'content/abc/index.md': { hash: 'h-md', text: '# title' }
    }
    const factory = createPlanFactory(
      { vault, index, transformer, manifestBuilder },
      settings
    )
    const plan = await factory()
    expect(plan.viewerCacheHit).toBe(true)
    expect(plan.viewerCacheKey).toBe(cacheKey)
    const cached = plan.files.filter((f) => f.kind === 'cached')
    // baseline 의 viewer 자산 (.nojekyll + _next/...) 만 cached
    expect(cached.length).toBe(2)
    expect(cached.some((f) => f.path === '.nojekyll')).toBe(true)
    expect(cached.some((f) => f.path === '_next/static/chunk.js')).toBe(true)
    // manifest 와 content 는 cached 아님 (orchestrator 가 text 로 등록)
    expect(cached.some((f) => f.path === 'manifest.json')).toBe(false)
  })

  it('force=true → cache hit 키 일치라도 무시 + 전체 unpack', async () => {
    const segment = 'notedrop-share'
    const cacheKey = buildViewerCacheKey(VIEWER_FINGERPRINT, '', segment)
    settings.lastViewerCacheKey = cacheKey
    settings.lastPublishedFiles = {
      '.nojekyll': { hash: 'h', text: '' }
    }
    const factory = createPlanFactory(
      { vault, index, transformer, manifestBuilder },
      settings
    )
    const plan = await factory({ force: true })
    expect(plan.viewerCacheHit).toBe(false)
    // 전체 unpack 시 cached entry 0
    expect(plan.files.filter((f) => f.kind === 'cached').length).toBe(0)
    // .nojekyll 은 text 로 등록
    const nojekyll = plan.files.find((f) => f.path.endsWith('.nojekyll'))
    expect(nojekyll?.kind).toBe('text')
  })

  it('cache key mismatch (publicRoot 변경) → cache miss', async () => {
    const cacheKey = buildViewerCacheKey(VIEWER_FINGERPRINT, '', 'notedrop-share')
    settings.lastViewerCacheKey = cacheKey
    settings.lastPublishedFiles = {
      '.nojekyll': { hash: 'h', text: '' }
    }
    settings.publicRoot = 'docs' // 다름
    const factory = createPlanFactory(
      { vault, index, transformer, manifestBuilder },
      settings
    )
    const plan = await factory()
    expect(plan.viewerCacheHit).toBe(false)
    expect(plan.viewerCacheKey).toContain('docs')
  })

  it('cache hit + lastPublishedFiles=null → cache miss (sanity)', async () => {
    const cacheKey = buildViewerCacheKey(VIEWER_FINGERPRINT, '', 'notedrop-share')
    settings.lastViewerCacheKey = cacheKey
    settings.lastPublishedFiles = null
    const factory = createPlanFactory(
      { vault, index, transformer, manifestBuilder },
      settings
    )
    const plan = await factory()
    expect(plan.viewerCacheHit).toBe(false)
  })
})
