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
  /** chapter 의 직속 vault 폴더 (예: 'Part 1. 파이썬 기초'). entry/root chapter 는 null.
   * Toc 가 chapter 를 그룹화하는 근거. v1 manifest 호환을 위해 optional. */
  section?: string | null
  chapters: string[] | null
  updatedAt: string
}

export type Manifest = {
  version: ManifestVersion
  generatedAt: string
  generatedBy: string
  items: ManifestItem[]
}
