import type { VaultFs } from '../ports/VaultFs.js'
import type { MetaCache } from '../ports/MetaCache.js'
import type { PublishIndex } from './PublishIndex.js'
import type {
  Reference,
  ReferenceKind,
  ReferenceResolution,
  ResolvedContent
} from './types.js'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'])
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  gif: 'image/gif'
}

const COMMENT_RE = /%%[\s\S]*?%%/g
const REF_RE = /(!?)\[\[([^\]\n]+)\]\]/g
const SIZE_RE = /^(\d+)(?:x(\d+))?$/

export class ContentResolver {
  constructor(
    private vault: VaultFs,
    private meta: MetaCache,
    private index: PublishIndex
  ) {}

  async resolve(filePath: string): Promise<ResolvedContent> {
    const rawMarkdown = await this.vault.readFile(filePath)
    const frontmatter = this.meta.getFrontmatter(filePath) ?? {}
    const body = stripFrontmatter(rawMarkdown)
    const refs = await this.extractRefs(body)
    return { rawMarkdown, frontmatter, refs }
  }

  private async extractRefs(body: string): Promise<Reference[]> {
    const sanitized = body.replace(COMMENT_RE, (m) => ' '.repeat(m.length))
    const out: Reference[] = []
    for (const match of sanitized.matchAll(REF_RE)) {
      const [rawText, bang, inner] = match
      const ref = await this.parseRef(rawText, bang === '!', inner!)
      out.push(ref)
    }
    return out
  }

  private async parseRef(
    rawText: string,
    isEmbed: boolean,
    inner: string
  ): Promise<Reference> {
    const [head, ...aliasParts] = inner.split('|')
    const aliasOrSize = aliasParts.join('|')
    const headTrimmed = head!.trim()
    const targetMatch = /^([^#]+)(?:#\^([\w-]+)|#([^#]+))?$/.exec(headTrimmed)
    if (!targetMatch) {
      return makeRef(rawText, isEmbed, headTrimmed, undefined, undefined, undefined,
        { kind: 'broken', reason: 'malformed wikilink target' })
    }
    const target = targetMatch[1]!.trim()
    const blockId = targetMatch[2]
    const anchor = targetMatch[3]
    const ext = extOf(target)
    const isImage = ext !== null && IMAGE_EXT.has(ext)
    const type: ReferenceKind = isImage ? 'image' : (isEmbed ? 'embed' : 'wikilink')

    let alias: string | undefined
    let size: { width?: number, height?: number } | undefined
    if (aliasOrSize) {
      if (isImage) {
        const sm = SIZE_RE.exec(aliasOrSize.trim())
        if (sm) {
          size = { width: Number(sm[1]) }
          if (sm[2]) size.height = Number(sm[2])
        } else {
          alias = aliasOrSize
        }
      } else {
        alias = aliasOrSize
      }
    }

    const resolution = await this.resolveTarget(type, target, ext)

    return makeRef(rawText, isEmbed, target, alias, anchor, blockId, resolution, size, type)
  }

  private async resolveTarget(
    type: ReferenceKind,
    target: string,
    ext: string | null
  ): Promise<ReferenceResolution> {
    if (type === 'image') {
      const matches = await this.vault.searchByName(target)
      if (matches.length === 0) {
        return { kind: 'broken', reason: `image not found: ${target}` }
      }
      return { kind: 'image', vaultPath: matches[0]!, mime: MIME_BY_EXT[ext!]! }
    }
    const noteName = target.replace(/\.md$/, '')
    const matches = await this.vault.searchByName(`${noteName}.md`)
    for (const candidate of matches) {
      const item = this.index.getByPath(candidate)
      if (item) {
        return { kind: 'published-note', hash: item.hash, slug: item.slug }
      }
    }
    return { kind: 'unpublished-note', noteName }
  }
}

function makeRef(
  rawText: string,
  isEmbed: boolean,
  target: string,
  alias: string | undefined,
  anchor: string | undefined,
  blockId: string | undefined,
  resolution: ReferenceResolution,
  size?: { width?: number, height?: number },
  type?: ReferenceKind
): Reference {
  return {
    type: type ?? (isEmbed ? 'embed' : 'wikilink'),
    rawText,
    target,
    ...(alias !== undefined ? { alias } : {}),
    ...(anchor !== undefined ? { anchor } : {}),
    ...(blockId !== undefined ? { blockId } : {}),
    ...(size !== undefined ? { size } : {}),
    resolution
  }
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---\n')) return raw
  const end = raw.indexOf('\n---', 4)
  if (end === -1) return raw
  return raw.slice(end + 4).replace(/^\n/, '')
}

function extOf(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return null
  return name.slice(dot + 1).toLowerCase()
}
