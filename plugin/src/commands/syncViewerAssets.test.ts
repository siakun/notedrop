import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../embedded/viewer.fingerprint.txt', () => ({
  default: 'test-fingerprint-sync'
}))
vi.mock('../embedded/viewer.zip.b64', () => ({ default: '' }))

vi.mock('obsidian', () => ({
  Notice: class {
    constructor(public message: string, public timeout?: number) {
      mockNotices.push({ message, timeout })
    }
    setMessage(msg: string) {
      this.message = msg
    }
    hide() {}
  }
}))

const mockNotices: { message: string; timeout?: number }[] = []

import { syncViewerAssets } from './syncViewerAssets.js'
import {
  buildViewerCacheKey,
  VIEWER_FINGERPRINT
} from '../services/PlanFactory.js'
import {
  DEFAULT_SETTINGS,
  type PluginSettings,
  type PublishedFileSnapshot
} from '../settings/PluginSettings.js'
import type { Logger } from '../services/Logger.js'

function makeSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    githubPat: 'pat-test',
    targetRepo: 'siakun/notedrop-share',
    publishViewerAssets: true,
    ...overrides
  }
}

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
}

describe('syncViewerAssets', () => {
  let originalFetch: typeof globalThis.fetch
  let saveCalls: number
  const saveSettings: () => Promise<void> = async () => {
    saveCalls++
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch
    saveCalls = 0
    mockNotices.length = 0
  })

  it('PAT 미입력 → early return + Notice', async () => {
    const settings = makeSettings({ githubPat: '' })
    await syncViewerAssets(
      { app: {} as never, logger: silentLogger, saveSettings },
      settings
    )
    expect(saveCalls).toBe(0)
    expect(mockNotices.some((n) => n.message.includes('GitHub PAT'))).toBe(true)
  })

  it('publishViewerAssets=false → early return + Notice', async () => {
    const settings = makeSettings({ publishViewerAssets: false })
    await syncViewerAssets(
      { app: {} as never, logger: silentLogger, saveSettings },
      settings
    )
    expect(saveCalls).toBe(0)
    expect(mockNotices.some((n) => n.message.includes('publishViewerAssets'))).toBe(true)
  })

  it('fingerprint 일치 → early return + Notice "변경 없음" + push 0', async () => {
    const cacheKey = buildViewerCacheKey(VIEWER_FINGERPRINT, '', 'notedrop-share')
    const settings = makeSettings({ lastViewerCacheKey: cacheKey })
    let fetchCalled = false
    globalThis.fetch = vi.fn(async () => {
      fetchCalled = true
      return new Response('{}', { status: 200 })
    }) as never

    await syncViewerAssets(
      { app: {} as never, logger: silentLogger, saveSettings },
      settings
    )
    expect(fetchCalled).toBe(false)
    expect(saveCalls).toBe(0)
    expect(mockNotices.some((n) => n.message.includes('변경 없음'))).toBe(true)

    globalThis.fetch = originalFetch
  })

  it('fingerprint 다름 → push 진행 + baseline 의 viewer 자산만 갱신 (manifest+content 보존)', async () => {
    const oldFingerprintKey = 'old-fingerprint|...|notedrop-share'
    const baseline: Record<string, PublishedFileSnapshot> = {
      'manifest.json': { hash: 'h-manifest', text: '{"v":1}' },
      'content/abc/index.md': { hash: 'h-content', text: '# title' },
      '_next/static/old-chunk.js': { hash: 'h-old-chunk', text: 'old' },
      '.nojekyll': { hash: 'h-nojekyll', text: '' }
    }
    const settings = makeSettings({
      lastViewerCacheKey: oldFingerprintKey,
      lastPublishedFiles: baseline
    })

    // GitHubPublisher fetch mock — 빈 repo 케이스 (404 ref) 로 시작
    const fetchCalls: { url: string; method: string }[] = []
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      fetchCalls.push({ url: u, method })
      if (u.endsWith('/refs/heads/main')) {
        return new Response(JSON.stringify({ object: { sha: 'parent-sha' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (u.includes('/commits/parent-sha')) {
        return new Response(JSON.stringify({ tree: { sha: 'parent-tree' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (u.endsWith('/blobs')) {
        return new Response(JSON.stringify({ sha: `blob-${fetchCalls.length}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (u.endsWith('/trees')) {
        return new Response(JSON.stringify({ sha: 'new-tree' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (u.endsWith('/commits')) {
        return new Response(JSON.stringify({ sha: 'new-commit' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (u.includes('/refs/heads/main') && method === 'PATCH') {
        return new Response('{}', { status: 200 })
      }
      return new Response('{}', { status: 200 })
    }) as never

    await syncViewerAssets(
      { app: {} as never, logger: silentLogger, saveSettings },
      settings
    )

    // baseline 갱신: manifest + content 보존, viewer 자산 path 만 갱신
    expect(settings.lastPublishedFiles).not.toBeNull()
    expect(settings.lastPublishedFiles!['manifest.json']).toEqual({
      hash: 'h-manifest',
      text: '{"v":1}'
    })
    expect(settings.lastPublishedFiles!['content/abc/index.md']).toEqual({
      hash: 'h-content',
      text: '# title'
    })
    // 옛 _next/static/old-chunk.js 는 새 baseline 에서 사라짐 (viewer 자산 갱신)
    expect(settings.lastPublishedFiles!['_next/static/old-chunk.js']).toBeUndefined()
    // .nojekyll 은 새로 존재 (collectViewerFiles 결과)
    expect(settings.lastPublishedFiles!['.nojekyll']).toBeDefined()
    // lastViewerCacheKey 갱신
    expect(settings.lastViewerCacheKey).not.toBe(oldFingerprintKey)
    expect(settings.lastViewerCacheKey).toContain(VIEWER_FINGERPRINT)
    // saveSettings 호출
    expect(saveCalls).toBeGreaterThan(0)
    // GitHub Tree API 호출됨
    expect(fetchCalls.length).toBeGreaterThan(0)
    expect(fetchCalls.some((c) => c.url.endsWith('/blobs'))).toBe(true)
    expect(fetchCalls.some((c) => c.url.endsWith('/trees'))).toBe(true)
    expect(fetchCalls.some((c) => c.url.endsWith('/commits'))).toBe(true)

    globalThis.fetch = originalFetch
  })
})
