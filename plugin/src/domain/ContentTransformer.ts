import type { VaultFs } from '../ports/VaultFs.js'
import type { PublishIndex } from './PublishIndex.js'
import type { ContentResolver } from './ContentResolver.js'
import type { PublishedItem, TransformedContent } from './types.js'
import type { PageFrontmatter } from '../types.js'

export class ContentTransformer {
  constructor(
    private resolver: ContentResolver,
    private index: PublishIndex,
    private vault: VaultFs
  ) {}

  async transform(filePath: string): Promise<TransformedContent> {
    const item = this.index.getByPath(filePath)
    if (!item) throw new Error(`ContentTransformer: ${filePath} not in index`)

    const resolved = await this.resolver.resolve(filePath)
    const stripped = stripFrontmatter(resolved.rawMarkdown)
    const hidden = applyHide(stripped)
    const warnings: string[] = []

    return {
      outputFrontmatter: this.buildFrontmatter(item),
      markdown: hidden,
      assetRefs: [],
      warnings
    }
  }

  private buildFrontmatter(item: PublishedItem): PageFrontmatter {
    return {
      hash: item.hash,
      slug: item.slug,
      title: item.title,
      render: item.render,
      type: item.type,
      parent: item.parent,
      order: item.order,
      cover: null,
      customCss: null,
      publishedAt: item.publishedAt,
      updatedAt: item.updatedAt
    }
  }
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---\n')) return raw
  const end = raw.indexOf('\n---', 4)
  if (end === -1) return raw
  return raw.slice(end + 4).replace(/^\n/, '')
}

const WAYPOINT_RE = /%%\s*Begin Waypoint\s*%%[\s\S]*?%%\s*End Waypoint\s*%%/gi
const COMMENT_RE = /%%[\s\S]*?%%/g

function applyHide(body: string): string {
  return body.replace(WAYPOINT_RE, '').replace(COMMENT_RE, '')
}
