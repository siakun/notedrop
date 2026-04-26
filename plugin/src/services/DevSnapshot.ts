import type { PluginSettings } from '../settings/PluginSettings.js'

const SECRET_KEYS = ['githubPat']

export type DevSnapshot = {
  settings: Omit<PluginSettings, 'lastPublishedFiles'> & {
    lastPublishedFiles?: undefined
  }
  baselineFileCount: number
  hasBaseline: boolean
  viewerCacheKeySet: boolean
  indexedNoteCount: number
  dirtyMarked: boolean
}

export type DevSnapshotInput = {
  settings: PluginSettings
  indexedNoteCount: number
  dirtyMarked: boolean
}

export function buildDevSnapshot(input: DevSnapshotInput): DevSnapshot {
  const { settings } = input
  const masked = { ...settings } as Record<string, unknown>
  for (const k of SECRET_KEYS) {
    const v = masked[k]
    if (typeof v === 'string' && v.length > 0) {
      masked[k] = v.length <= 8 ? '***' : `${v.slice(0, 4)}***${v.slice(-2)}`
    }
  }
  // lastPublishedFiles 전체 노출은 위험 (수십~수백 KB) → count 만
  const baselineFileCount = settings.lastPublishedFiles
    ? Object.keys(settings.lastPublishedFiles).length : 0
  delete masked.lastPublishedFiles
  return {
    settings: masked as DevSnapshot['settings'],
    baselineFileCount,
    hasBaseline: settings.lastPublishedDigest !== null
      || settings.lastPublishedFiles !== null,
    viewerCacheKeySet: settings.lastViewerCacheKey !== null,
    indexedNoteCount: input.indexedNoteCount,
    dirtyMarked: input.dirtyMarked
  }
}
