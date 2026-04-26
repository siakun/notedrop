import type { SeedEntry } from '../domain/PublishIndex.js'

export type PublishedFileSnapshot = {
  hash: string
  text: string | null
}

export type PluginSettings = {
  githubPat: string
  targetRepo: string
  targetBranch: string
  publicRoot: string
  publishViewerAssets: boolean
  previewPort: number
  autoStartPreview: boolean
  autoUnpublish: boolean
  publishedSeeds: SeedEntry[]
  unpublishedChanges: boolean
  lastPublishedDigest: string | null
  lastPublishedFiles: Record<string, PublishedFileSnapshot> | null
  /**
   * 개발자 모드 — 켜져 있으면 모든 publish/preview 진단 정보가
   * `<vault>/.obsidian/plugins/notedrop/notedrop.log` 에 append 로 기록.
   * 끄면 console 만 (옵시디언 DevTools 콘솔). 기본 false.
   */
  debugMode: boolean
}

export const DEFAULT_SETTINGS: PluginSettings = {
  githubPat: '',
  targetRepo: '',
  targetBranch: 'main',
  publicRoot: '',
  publishViewerAssets: true,
  previewPort: 4321,
  autoStartPreview: false,
  autoUnpublish: false,
  publishedSeeds: [],
  unpublishedChanges: true,
  lastPublishedDigest: null,
  lastPublishedFiles: null,
  debugMode: false
}
