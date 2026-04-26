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
    const assetRefs: import('./types.js').AssetRef[] = []

    let body = stripFrontmatter(resolved.rawMarkdown)
    body = applyHide(body)
    body = await this.transformBody(body, resolved.refs, item.hash, 1, warnings, assetRefs)

    const cover = await this.resolveCover(item, warnings, assetRefs)
    const customCss = await this.buildCustomCss(item, warnings)

    return {
      outputFrontmatter: { ...this.buildFrontmatter(item), cover, customCss },
      markdown: body,
      assetRefs,
      warnings
    }
  }

  private async transformBody(
    body: string,
    refs: import('./types.js').Reference[],
    ownerHash: string,
    depthLeft: number,
    warnings: string[],
    assetRefs: import('./types.js').AssetRef[]
  ): Promise<string> {
    for (const ref of refs) {
      if (ref.type === 'wikilink') {
        body = replaceAll(body, ref.rawText, renderWikilink(ref))
        continue
      }
      if (ref.type === 'embed') {
        body = await this.processEmbed(body, ref, ownerHash, depthLeft, warnings, assetRefs)
        continue
      }
      if (ref.type === 'image') {
        body = await this.processImage(body, ref, ownerHash, warnings, assetRefs)
        continue
      }
    }
    return body
  }

  private async processImage(
    body: string,
    ref: import('./types.js').Reference,
    ownerHash: string,
    warnings: string[],
    assetRefs: import('./types.js').AssetRef[]
  ): Promise<string> {
    const res = ref.resolution
    if (res.kind !== 'image') {
      warnings.push(`broken image: ${ref.target}`)
      return replaceAll(body, ref.rawText, `[이미지 누락: ${ref.target}]`)
    }
    const basename = res.vaultPath.split('/').pop()!
    const outputPath = `/content/${ownerHash}/_assets/${basename}`
    const bytes = await this.vault.readBinary(res.vaultPath)
    if (!assetRefs.some((a) => a.outputPath === outputPath)) {
      assetRefs.push({
        vaultPath: res.vaultPath,
        outputPath,
        size: bytes.byteLength,
        mime: res.mime
      })
    }
    const attrs = [`src="${outputPath}"`, 'alt=""']
    if (ref.size?.width !== undefined) attrs.push(`width="${ref.size.width}"`)
    if (ref.size?.height !== undefined) attrs.push(`height="${ref.size.height}"`)
    return replaceAll(body, ref.rawText, `<img ${attrs.join(' ')}>`)
  }

  private async resolveCover(
    item: PublishedItem,
    warnings: string[],
    assetRefs: import('./types.js').AssetRef[]
  ): Promise<string | null> {
    if (!item.cover) return null
    const basename = item.cover.split('/').pop()!
    const matches = await this.vault.searchByName(basename)
    if (matches.length === 0) {
      warnings.push(`cover not found: ${item.cover}`)
      return null
    }
    const vaultPath = matches[0]!
    const bytes = await this.vault.readBinary(vaultPath)
    const outputPath = `/content/${item.hash}/_assets/${basename}`
    if (!assetRefs.some((a) => a.outputPath === outputPath)) {
      assetRefs.push({
        vaultPath,
        outputPath,
        size: bytes.byteLength,
        mime: mimeFor(basename)
      })
    }
    return outputPath
  }

  private async buildCustomCss(
    item: PublishedItem,
    warnings: string[]
  ): Promise<string | null> {
    const parts: string[] = []
    if (item.customCssRaw.inline) parts.push(item.customCssRaw.inline)
    if (item.customCssRaw.file) {
      const filePath = await this.resolveVaultPath(item.customCssRaw.file)
      if (filePath) {
        parts.push(await this.vault.readFile(filePath))
      } else {
        warnings.push(`customCss file not found: ${item.customCssRaw.file}`)
      }
    }
    if (parts.length === 0) return null
    return sanitizeCss(parts.join('\n'))
  }

  private async resolveVaultPath(pathOrBasename: string): Promise<string | null> {
    if (await this.vault.fileExists(pathOrBasename)) return pathOrBasename
    const basename = pathOrBasename.split('/').pop()!
    const matches = await this.vault.searchByName(basename)
    return matches[0] ?? null
  }

  private async processEmbed(
    body: string,
    ref: import('./types.js').Reference,
    ownerHash: string,
    depthLeft: number,
    warnings: string[],
    assetRefs: import('./types.js').AssetRef[]
  ): Promise<string> {
    if (depthLeft <= 0) {
      return replaceAll(body, ref.rawText, EMBED_OVERFLOW_HTML)
    }
    const res = ref.resolution
    if (res.kind === 'unpublished-note') {
      return replaceAll(body, ref.rawText, embedUnpublishedPlaceholder(res.noteName))
    }
    if (res.kind === 'broken') {
      warnings.push(`broken embed: ${ref.target}`)
      return replaceAll(body, ref.rawText, embedUnpublishedPlaceholder(ref.target))
    }
    if (res.kind === 'published-note') {
      const target = this.index.get(res.hash)
      if (!target) return replaceAll(body, ref.rawText, embedUnpublishedPlaceholder(ref.target))
      const targetResolved = await this.resolver.resolve(target.filePath)
      let inner = stripFrontmatter(targetResolved.rawMarkdown)
      inner = applyHide(inner)
      inner = await this.transformBody(
        inner, targetResolved.refs, ownerHash, depthLeft - 1, warnings, assetRefs
      )
      return replaceAll(body, ref.rawText, inner)
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
    return `[${text}](#/${slugOrHash}/)`
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

const EMBED_OVERFLOW_HTML = '<div class="notedrop-embed-overflow">(임베드 깊이 초과)</div>'

function embedUnpublishedPlaceholder(name: string): string {
  return `<div class="notedrop-embed-placeholder">접근할 수 없는 문서: ${name}</div>`
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  gif: 'image/gif'
}

function mimeFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

function sanitizeCss(css: string): string {
  return css
    .split(/\r?\n/)
    .filter((line) => !/@import\b/i.test(line))
    .join('\n')
    .replace(/url\(\s*['"]?https?:[^)]*\)/gi, 'url()')
    .replace(/\bexpression\s*\([^)]*\)/gi, '')
}
