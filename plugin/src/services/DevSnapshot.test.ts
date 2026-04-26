import { describe, it, expect } from 'vitest'
import { buildDevSnapshot } from './DevSnapshot.js'
import type { PluginSettings } from '../settings/PluginSettings.js'

describe('buildDevSnapshot', () => {
  const settings: PluginSettings = {
    githubPat: 'ghp_secret123456789',
    targetRepo: 'siakun/notedrop-share',
    targetBranch: 'main',
    publicRoot: '',
    publishViewerAssets: true,
    previewPort: 4321,
    autoStartPreview: false,
    autoUnpublish: false,
    publishedSeeds: [],
    unpublishedChanges: false,
    lastPublishedDigest: 'abc123',
    lastPublishedFiles: { 'a.md': { hash: 'h1', text: null } },
    lastViewerCacheKey: 'cache-key-xyz',
    debugMode: true
  }

  it('settings 의 githubPat 가 마스킹 존재', () => {
    const snap = buildDevSnapshot({ settings, indexedNoteCount: 5, dirtyMarked: false })
    expect(snap.settings.githubPat).toBe('ghp_***89')
    expect(snap.settings.targetRepo).toBe('siakun/notedrop-share')
  })

  it('lastPublishedFiles 전체 노출 안 함 (count 만)', () => {
    const snap = buildDevSnapshot({ settings, indexedNoteCount: 5, dirtyMarked: false })
    expect(snap.settings.lastPublishedFiles).toBeUndefined()
    expect(snap.baselineFileCount).toBe(1)
  })

  it('plugin meta + index/dirty 존재', () => {
    const snap = buildDevSnapshot({ settings, indexedNoteCount: 7, dirtyMarked: true })
    expect(snap.indexedNoteCount).toBe(7)
    expect(snap.dirtyMarked).toBe(true)
    expect(snap.hasBaseline).toBe(true)
    expect(snap.viewerCacheKeySet).toBe(true)
  })
})
