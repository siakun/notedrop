import type { SeedEntry } from '../domain/PublishIndex.js'

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
  unpublishedChanges: true
}
