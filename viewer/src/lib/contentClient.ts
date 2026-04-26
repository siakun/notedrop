import type { PageContent, PageFrontmatter } from '@/types/content'
import type { ItemType, RenderMode } from '@/types/manifest'
import { Resource } from './resource'
import { logger } from './logger'

const resource = new Resource<PageContent>(async (hash) => {
  const res = await fetch(`content/${hash}/index.md`, { cache: 'no-store' })
  if (!res.ok) {
    logger.error('content', `fetch failed (${hash}): ${res.status}`)
    throw new Error(`content fetch failed (${hash}): ${res.status}`)
  }
  const raw = await res.text()
  const parsed = parsePageMarkdown(raw)
  logger.debug('content', `fetched ${hash}`, {
    bodyLength: parsed.body.length,
    title: parsed.frontmatter.title
  })
  return parsed
})

export function fetchContent(hash: string, force = false): Promise<PageContent> {
  return resource.get(hash, force)
}

export function invalidateContent(hash: string): void {
  resource.invalidate(hash)
}

export function invalidateAllContent(): void {
  resource.invalidateAll()
}

export function subscribeContent(fn: (hash: string) => void): () => void {
  return resource.subscribe(fn)
}

export function peekContent(hash: string): PageContent | null {
  return resource.peek(hash)
}

const FENCE = '---\n'

/**
 * `---\n<yaml>\n---\n<body>` 형식 markdown 파싱. ContentTransformer 가
 * 만든 PageFrontmatter 형식의 단순 key:value 라인만 처리 (gray-matter 의존
 * 절감).
 */
export function parsePageMarkdown(raw: string): PageContent {
  if (!raw.startsWith(FENCE)) {
    return { frontmatter: defaultFrontmatter(), body: raw }
  }
  const end = raw.indexOf('\n---', FENCE.length)
  if (end === -1) {
    return { frontmatter: defaultFrontmatter(), body: raw }
  }
  const yamlBlock = raw.slice(FENCE.length, end)
  let body = raw.slice(end + 4)
  if (body.startsWith('\n')) body = body.slice(1)
  if (body.startsWith('\n')) body = body.slice(1)
  return { frontmatter: parseFrontmatter(yamlBlock), body }
}

function parseFrontmatter(yamlBlock: string): PageFrontmatter {
  const fm = defaultFrontmatter()
  for (const line of yamlBlock.split(/\r?\n/)) {
    if (!line.trim()) continue
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const valueRaw = line.slice(colon + 1).trim()
    const value = parseValue(valueRaw)
    assignFrontmatter(fm, key, value)
  }
  return fm
}

function parseValue(raw: string): unknown {
  if (raw === '' || raw === 'null' || raw === '~') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.startsWith('"') || raw.startsWith('[') || raw.startsWith('{')) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  return raw
}

function assignFrontmatter(fm: PageFrontmatter, key: string, value: unknown): void {
  switch (key) {
    case 'hash':
      fm.hash = String(value)
      break
    case 'slug':
      fm.slug = value === null ? null : String(value)
      break
    case 'title':
      fm.title = String(value)
      break
    case 'render':
      fm.render = (value as RenderMode) === 'book' ? 'book' : 'doc'
      break
    case 'type':
      fm.type = (value as ItemType) === 'chapter' ? 'chapter' : 'entry'
      break
    case 'parent':
      fm.parent = value === null ? null : String(value)
      break
    case 'order':
      fm.order = typeof value === 'number' ? value : null
      break
    case 'cover':
      fm.cover = value === null ? null : String(value)
      break
    case 'customCss':
      fm.customCss = value === null ? null : String(value)
      break
    case 'publishedAt':
      fm.publishedAt = String(value)
      break
    case 'updatedAt':
      fm.updatedAt = String(value)
      break
  }
}

function defaultFrontmatter(): PageFrontmatter {
  return {
    hash: '',
    slug: null,
    title: '',
    render: 'doc',
    type: 'entry',
    parent: null,
    order: null,
    cover: null,
    customCss: null,
    publishedAt: '',
    updatedAt: ''
  }
}
