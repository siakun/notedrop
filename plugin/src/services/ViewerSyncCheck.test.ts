import { describe, it, expect, vi } from 'vitest'

// PlanFactory 의 VIEWER_FINGERPRINT fixed (deterministic test).
vi.mock('../embedded/viewer.fingerprint.txt', () => ({
  default: 'test-fingerprint-vsc'
}))
vi.mock('../embedded/viewer.zip.b64', () => ({ default: '' }))

import {
  checkViewerFingerprintMismatch,
  VIEWER_SYNC_NOTICE_MESSAGE,
  VIEWER_SYNC_NOTICE_TIMEOUT_MS
} from './ViewerSyncCheck.js'
import { buildViewerCacheKey, VIEWER_FINGERPRINT } from './PlanFactory.js'
import {
  DEFAULT_SETTINGS,
  type PluginSettings
} from '../settings/PluginSettings.js'

function makeSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    targetRepo: 'siakun/notedrop-share',
    publicRoot: '',
    publishViewerAssets: true,
    ...overrides
  }
}

describe('checkViewerFingerprintMismatch', () => {
  it('publishViewerAssets=false → needsSync=false (옵션 disabled)', () => {
    const r = checkViewerFingerprintMismatch(makeSettings({ publishViewerAssets: false }))
    expect(r.needsSync).toBe(false)
  })

  it('baseline=null (첫 publish) → needsSync=false', () => {
    const r = checkViewerFingerprintMismatch(makeSettings({ lastViewerCacheKey: null }))
    expect(r.needsSync).toBe(false)
    expect(r.baselineFingerprint).toBeNull()
    expect(r.currentFingerprint).not.toBeNull()
  })

  it('fingerprint match → needsSync=false', () => {
    const matchKey = buildViewerCacheKey(
      VIEWER_FINGERPRINT,
      '',
      'notedrop-share'
    )
    const r = checkViewerFingerprintMismatch(makeSettings({ lastViewerCacheKey: matchKey }))
    expect(r.needsSync).toBe(false)
    expect(r.currentFingerprint).toBe(matchKey)
    expect(r.baselineFingerprint).toBe(matchKey)
  })

  it('fingerprint mismatch (옵션 B 의 누락 진단) → needsSync=true', () => {
    const r = checkViewerFingerprintMismatch(
      makeSettings({ lastViewerCacheKey: 'old-fingerprint||notedrop-share' })
    )
    expect(r.needsSync).toBe(true)
    expect(r.currentFingerprint).toContain(VIEWER_FINGERPRINT)
    expect(r.baselineFingerprint).toBe('old-fingerprint||notedrop-share')
  })

  it('publicRoot 변경 → 다른 fingerprint → needsSync=true', () => {
    const baseline = buildViewerCacheKey(VIEWER_FINGERPRINT, '', 'notedrop-share')
    const r = checkViewerFingerprintMismatch(
      makeSettings({ lastViewerCacheKey: baseline, publicRoot: 'docs' })
    )
    expect(r.needsSync).toBe(true)
  })

  it('repoSegment 변경 → 다른 fingerprint → needsSync=true', () => {
    const baseline = buildViewerCacheKey(VIEWER_FINGERPRINT, '', 'notedrop-share')
    const r = checkViewerFingerprintMismatch(
      makeSettings({
        lastViewerCacheKey: baseline,
        targetRepo: 'siakun/different-repo'
      })
    )
    expect(r.needsSync).toBe(true)
  })

  it('Notice 메시지/timeout 상수 등록 (호출 측 일관성 의무)', () => {
    expect(VIEWER_SYNC_NOTICE_MESSAGE).toContain('Sync viewer assets')
    expect(VIEWER_SYNC_NOTICE_TIMEOUT_MS).toBeGreaterThan(0)
  })
})
