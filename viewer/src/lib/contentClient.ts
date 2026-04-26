import type { PageContent, PageFrontmatter } from '@/types/content'
import type { ItemType, RenderMode } from '@/types/manifest'
import { withBase } from './basePath'

const cache = new Map<string, PageContent>()
const inflight = new Map<string, Promise<PageContent>>()
const subscribers = new Set<(hash: string) => void>()

export async function fetchContent(hash: string, force = false): Promise<PageContent> {
  if (!force) {
    const cached = cache.get(hash)
    if (cached) return cached
    const pending = inflight.get(hash)
    if (pending) return pending
  }
  const promise = (async () => {
    const res = await fetch(withBase(`/content/${hash}/index.md`), { cache: 'no-store' })
    if (!res.ok) throw new Error(`content fetch failed (${hash}): ${res.status}`)
    const raw = await res.text()
    const parsed = parsePageMarkdown(raw)
    cache.set(hash, parsed)
    return parsed
  })()
  inflight.set(hash, promise)
  try {
    return await promise
  } finally {
    inflight.delete(hash)
  }
}

export function invalidateContent(hash: string): void {
  cache.delete(hash)
  for (const fn of subscribers) {
    try { fn(hash) } catch {}
  }
}

export function invalidateAllContent(): void {
  const hashes = Array.from(cache.keys())
  cache.clear()
  for (const fn of subscribers) {
    for (const h of hashes) {
      try { fn(h) } catch {}
    }
  }
}

export function subscribeContent(fn: (hash: string) => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function peekContent(hash: string): PageContent | null {
  return cache.get(hash) ?? null
}

const FENCE = '---\n'

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
