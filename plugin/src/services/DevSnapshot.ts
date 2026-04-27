import type { PluginSettings } from '../settings/PluginSettings.js'
import { redactRecordSecrets } from './SecretMasking.js'

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
  const masked = redactRecordSecrets({ ...settings } as Record<string, unknown>)
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
