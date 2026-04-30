// Public output types - cross plugin/viewer/public-repo boundary.
// See docs/07-data-model.md sec 7.2-7.3.
// Stability: manifest version bump required for incompatible change.

export type ManifestVersion = 1

export type Manifest = {
  version: ManifestVersion
  generatedAt: string
  generatedBy: string
  items: ManifestItem[]
}

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
   * viewer Toc 가 chapter 를 그룹화하는 근거. */
  section: string | null
  chapters: string[] | null
  updatedAt: string
}

export type PageFrontmatter = {
  hash: string
  slug: string | null
  title: string
  render: RenderMode
  type: ItemType
  parent: string | null
  order: number | null
  cover: string | null
  customCss: string | null
  publishedAt: string
  updatedAt: string
}
