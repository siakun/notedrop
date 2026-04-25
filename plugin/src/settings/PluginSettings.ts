export type PluginSettings = {
  githubPat: string
  targetRepo: string
  previewPort: number
  autoStartPreview: boolean
  autoUnpublish: boolean
  shareUrlBase: string
}

export const DEFAULT_SETTINGS: PluginSettings = {
  githubPat: '',
  targetRepo: '',
  previewPort: 4321,
  autoStartPreview: false,
  autoUnpublish: false,
  shareUrlBase: ''
}
