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
    const warnings: string[] = []

    let body = stripFrontmatter(resolved.rawMarkdown)
    body = applyHide(body)
    body = this.transformWikilinks(body, resolved.refs)

    return {
      outputFrontmatter: this.buildFrontmatter(item),
      markdown: body,
      assetRefs: [],
      warnings
    }
  }

  private transformWikilinks(body: string, refs: import('./types.js').Reference[]): string {
    for (const ref of refs) {
      if (ref.type !== 'wikilink') continue
      body = replaceAll(body, ref.rawText, renderWikilink(ref))
    }
    return body
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

function renderWikilink(ref: import('./types.js').Reference): string {
  const res = ref.resolution
  if (res.kind === 'published-note') {
    const slugOrHash = res.slug ?? res.hash
    const text = ref.alias ?? ref.target
    return `[${text}](/notedrop/${slugOrHash})`
  }
  if (res.kind === 'unpublished-note') {
    if (ref.alias !== undefined) {
      return `<span class="notedrop-deadlink">${ref.alias}</span>`
    }
    return `<span class="notedrop-deadlink">${res.noteName}(접근 권한이 없습니다)</span>`
  }
  return `<span class="notedrop-deadlink">${ref.target}(접근 권한이 없습니다)</span>`
}

function replaceAll(body: string, needle: string, replacement: string): string {
  return body.split(needle).join(replacement)
}
