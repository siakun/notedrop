export type PluginSettings = {
  githubPat: string
  targetRepo: string
  targetBranch: string
  publicRoot: string
  previewPort: number
  autoStartPreview: boolean
  autoUnpublish: boolean
  shareUrlBase: string
}

export const DEFAULT_SETTINGS: PluginSettings = {
  githubPat: '',
  targetRepo: '',
  targetBranch: 'main',
  publicRoot: 'viewer/public',
  previewPort: 4321,
  autoStartPreview: false,
  autoUnpublish: false,
  shareUrlBase: ''
}
