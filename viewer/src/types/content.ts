import type { RenderMode, ItemType } from './manifest'

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

export type PageContent = {
  frontmatter: PageFrontmatter
  body: string
}
