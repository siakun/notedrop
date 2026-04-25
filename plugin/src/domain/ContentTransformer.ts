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
    const body = stripFrontmatter(resolved.rawMarkdown)
    const warnings: string[] = []

    return {
      outputFrontmatter: this.buildFrontmatter(item),
      markdown: body,
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
