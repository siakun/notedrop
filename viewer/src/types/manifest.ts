export type ManifestVersion = 1

export type RenderMode = 'book' | 'doc'
export type ItemType = 'entry' | 'chapter'

export type ManifestItem = {
  hash: string
  slug: string | null
  title: string
  cover: string | null
  render: RenderMode
  type: ItemType
  parent: string | null
  order: number | null
  chapters: string[] | null
  updatedAt: string
}

export type Manifest = {
  version: ManifestVersion
  generatedAt: string
  generatedBy: string
  items: ManifestItem[]
}
