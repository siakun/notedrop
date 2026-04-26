import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DirtyTracker } from './DirtyTracker.js'
import type { PlanFactory } from './PlanFactory.js'
import {
  DEFAULT_SETTINGS,
  type PluginSettings,
  type PublishedFileSnapshot
} from '../settings/PluginSettings.js'
import type { PublishedFile, PublishPlan } from '../domain/PublishOrchestrator.js'

function makeSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

function makePlan(
  files: PublishedFile[],
  viewerCacheKey: string | null = null,
  viewerCacheHit = false
): PublishPlan {
  return {
    files,
    manifest: { version: 1, generatedAt: '', generatedBy: 'test', items: [] },
    warnings: [],
    viewerCacheKey,
    viewerCacheHit
  }
}

describe('DirtyTracker cached kind handling (v0.1.45)', () => {
  let saveCalls: number
  const saveSettings: () => Promise<void> = async () => {
    saveCalls++
  }

  beforeEach(() => {
    saveCalls = 0
  })

  it('cached entry 의 hash 는 file.hash 그대로 사용 (재계산 skip)', async () => {
    const baseline: Record<string, PublishedFileSnapshot> = {
      'foo.txt': { hash: 'baseline-hash-foo', text: null },
      'bar.bin': { hash: 'baseline-hash-bar', text: null }
    }
    const settings = makeSettings({
      lastPublishedFiles: baseline,
      lastViewerCacheKey: 'k'
    })
    const buildPlan: PlanFactory = async () =>
      makePlan(
        [
          { kind: 'cached', path: 'foo.txt', hash: 'baseline-hash-foo' },
          { kind: 'cached', path: 'bar.bin', hash: 'baseline-hash-bar' }
        ],
        'k',
        true
      )
    const tracker = new DirtyTracker(buildPlan, settings, saveSettings)
    const snap = await tracker.computeSnapshot()
    expect(snap.files['foo.txt']).toEqual({ hash: 'baseline-hash-foo', text: null })
    expect(snap.files['bar.bin']).toEqual({ hash: 'baseline-hash-bar', text: null })
    expect(snap.viewerCacheKey).toBe('k')
  })

  it('cache hit + miss 동일 plan 의 digest 가 동일 (snapshot 정확성)', async () => {
    const text: PublishedFile = { kind: 'text', path: 'foo.txt', content: 'hello' }
    const buildPlanMiss: PlanFactory = async () => makePlan([text], 'k', false)
    const trackerMiss = new DirtyTracker(buildPlanMiss, makeSettings(), saveSettings)
    const snapMiss = await trackerMiss.computeSnapshot()
    const fooSnap = snapMiss.files['foo.txt']
    expect(fooSnap).toBeDefined()
    const fooHash = fooSnap!.hash

    // cache hit 가정 — baseline 에 동일 hash 존재 plan 이 cached 로 옴
    const baseline: Record<string, PublishedFileSnapshot> = {
      'foo.txt': { hash: fooHash, text: 'hello' }
    }
    const settingsHit = makeSettings({ lastPublishedFiles: baseline })
    const buildPlanHit: PlanFactory = async () =>
      makePlan([{ kind: 'cached', path: 'foo.txt', hash: fooHash }], 'k', true)
    const trackerHit = new DirtyTracker(buildPlanHit, settingsHit, saveSettings)
    const snapHit = await trackerHit.computeSnapshot()
    // 동일 path + 동일 hash → 동일 digest
    expect(snapHit.digest).toBe(snapMiss.digest)
  })

  it('confirmPublished 가 lastViewerCacheKey 도 settings 에 저장', async () => {
    const settings = makeSettings()
    const tracker = new DirtyTracker(
      async () => makePlan([], 'cache-key-abc', false),
      settings,
      saveSettings
    )
    await tracker.confirmPublished({
      digest: 'd',
      files: { 'x.txt': { hash: 'h', text: 'x' } },
      viewerCacheKey: 'cache-key-abc'
    })
    expect(settings.lastViewerCacheKey).toBe('cache-key-abc')
    expect(settings.lastPublishedDigest).toBe('d')
    expect(settings.unpublishedChanges).toBe(false)
    expect(saveCalls).toBeGreaterThan(0)
  })

  it('confirmPublished updateViewerCacheKey=false → lastViewerCacheKey 갱신 안 함 (v0.1.46 옵션 B)', async () => {
    const settings = makeSettings({ lastViewerCacheKey: 'old-key' })
    const tracker = new DirtyTracker(
      async () => makePlan([], 'new-key', false),
      settings,
      saveSettings
    )
    await tracker.confirmPublished(
      {
        digest: 'd',
        files: { 'x.txt': { hash: 'h', text: 'x' } },
        viewerCacheKey: 'new-key'
      },
      { updateViewerCacheKey: false }
    )
    // lastViewerCacheKey 는 옛 값 그대로 (실 viewer 자산 push 안 함 케이스)
    expect(settings.lastViewerCacheKey).toBe('old-key')
    // 단 digest + files + unpublishedChanges 는 갱신
    expect(settings.lastPublishedDigest).toBe('d')
    expect(settings.unpublishedChanges).toBe(false)
  })

  it('computeSnapshot force option 이 buildPlan 에 전파', async () => {
    const settings = makeSettings()
    const buildPlan = vi.fn(async (opts?: { force?: boolean }) =>
      makePlan(
        [{ kind: 'text', path: 'a', content: 'a' }],
        'k',
        opts?.force ? false : true
      )
    )
    const tracker = new DirtyTracker(
      buildPlan as unknown as PlanFactory,
      settings,
      saveSettings
    )
    await tracker.computeSnapshot({ force: true })
    expect(buildPlan).toHaveBeenCalledWith({ force: true })
  })

  it('cached entry text 는 baseline 에서 lookup', async () => {
    const baseline: Record<string, PublishedFileSnapshot> = {
      'foo.txt': { hash: 'h', text: 'baseline-text' }
    }
    const settings = makeSettings({ lastPublishedFiles: baseline })
    const tracker = new DirtyTracker(
      async () => makePlan([{ kind: 'cached', path: 'foo.txt', hash: 'h' }], 'k', true),
      settings,
      saveSettings
    )
    const snap = await tracker.computeSnapshot()
    expect(snap.files['foo.txt']).toEqual({ hash: 'h', text: 'baseline-text' })
  })

  it('cached entry 가 baseline 에 없으면 text=null (sanity)', async () => {
    const settings = makeSettings({ lastPublishedFiles: null })
    const tracker = new DirtyTracker(
      async () => makePlan([{ kind: 'cached', path: 'orphan.txt', hash: 'h' }], 'k', true),
      settings,
      saveSettings
    )
    const snap = await tracker.computeSnapshot()
    expect(snap.files['orphan.txt']).toEqual({ hash: 'h', text: null })
  })
})

describe('DirtyTracker 기존 동작 회귀 (v0.1.42 까지)', () => {
  let saveCalls: number
  const saveSettings: () => Promise<void> = async () => {
    saveCalls++
  }
  let settings: PluginSettings

  beforeEach(() => {
    saveCalls = 0
    settings = { ...DEFAULT_SETTINGS, unpublishedChanges: true }
  })

  it('isDirty 가 settings 의 unpublishedChanges 그대로', () => {
    const tracker = new DirtyTracker(
      async () => makePlan([]),
      settings,
      saveSettings
    )
    expect(tracker.isDirty()).toBe(true)
    settings.unpublishedChanges = false
    expect(tracker.isDirty()).toBe(false)
  })

  it('markDirty 가 boolean true 로 set', () => {
    settings.unpublishedChanges = false
    const tracker = new DirtyTracker(
      async () => makePlan([]),
      settings,
      saveSettings
    )
    tracker.markDirty()
    expect(settings.unpublishedChanges).toBe(true)
  })

  it('revalidate: digest 동일이면 dirty=false 로 정정 + saveSettings', async () => {
    const text: PublishedFile = { kind: 'text', path: 'a.txt', content: 'a' }
    const tracker = new DirtyTracker(
      async () => makePlan([text]),
      settings,
      saveSettings
    )
    const snap = await tracker.computeSnapshot()
    settings.lastPublishedDigest = snap.digest
    settings.unpublishedChanges = true
    const result = await tracker.revalidate()
    expect(result).toBe(false)
    expect(settings.unpublishedChanges).toBe(false)
    expect(saveCalls).toBeGreaterThan(0)
  })

  it('computeDiff added/modified/removed 분류', async () => {
    settings.lastPublishedFiles = {
      'kept.txt': { hash: 'h-old', text: 'old' },
      'gone.txt': { hash: 'h-gone', text: 'g' }
    }
    const tracker = new DirtyTracker(
      async () =>
        makePlan([
          { kind: 'text', path: 'kept.txt', content: 'new' }, // modified
          { kind: 'text', path: 'fresh.txt', content: 'f' } // added
        ]),
      settings,
      saveSettings
    )
    const diff = await tracker.computeDiff()
    expect(diff.added).toEqual(['fresh.txt'])
    expect(diff.modified).toEqual(['kept.txt'])
    expect(diff.removed).toEqual(['gone.txt'])
    expect(diff.hasBaseline).toBe(true)
  })
})
