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
   * Viewer 자산 fingerprint cache key. PlanFactory 가 매 publish 시
   * `${VIEWER_FINGERPRINT}|${publicRoot}|${repoSegment}` 형식으로 빌드하여
   * 이 값과 비교. 동일이면 viewer 자산 unpack/path-replace 를 skip 하고
   * baseline 의 hash 를 cached entry 로 재사용 (변경 감지 결과 변경 없음
   * 분류 → push 안 됨). 다르면 전체 unpack (옛 동작). v0.1.45 도입.
   */
  lastViewerCacheKey: string | null
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
  lastViewerCacheKey: null,
  debugMode: false
}
