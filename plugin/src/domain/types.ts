// Domain internal types. Free to evolve. See docs/08-interfaces.md sec 8.2.

import type { RenderMode, ItemType } from '../types.js'

export type PublishedItem = {
  hash: string
  slug: string | null
  filePath: string
  title: string
  render: RenderMode
  type: ItemType
  parent: string | null
  order: number | null
  chapters: string[] | null
  cover: string | null
  customCssRaw: { inline: string | null, file: string | null }
  publishedAt: string
  updatedAt: string
}

export type ReferenceKind = 'wikilink' | 'embed' | 'image'

export type ReferenceResolution =
  | { kind: 'published-note', hash: string, slug: string | null }
  | { kind: 'unpublished-note', noteName: string }
  | { kind: 'image', vaultPath: string, mime: string }
  | { kind: 'broken', reason: string }

export type Reference = {
  type: ReferenceKind
  rawText: string
  target: string
  alias?: string
  anchor?: string
  blockId?: string
  size?: { width?: number, height?: number }
  resolution: ReferenceResolution
}

export type ResolvedContent = {
  rawMarkdown: string
  frontmatter: Record<string, unknown>
  refs: Reference[]
}

export type AssetRef = {
  vaultPath: string
  outputPath: string
  size: number
  mime: string
}

export type TransformedContent = {
  outputFrontmatter: import('../types.js').PageFrontmatter
  markdown: string
  assetRefs: AssetRef[]
  warnings: string[]
}

export type ChapterPlan = {
  source: 'waypoint' | 'moc' | 'folder-scan'
  chapters: { filePath: string, order: number }[]
}
