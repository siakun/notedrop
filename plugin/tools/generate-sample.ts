import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { parse as parseYaml } from 'yaml'

import { PublishIndex } from '../src/domain/PublishIndex.js'
import { ContentResolver } from '../src/domain/ContentResolver.js'
import { ContentTransformer } from '../src/domain/ContentTransformer.js'
import { ManifestBuilder } from '../src/domain/ManifestBuilder.js'
import { BookAssembler } from '../src/domain/BookAssembler.js'
import { PublishOrchestrator } from '../src/domain/PublishOrchestrator.js'
import type { VaultFs } from '../src/ports/VaultFs.js'
import type {
  MetaCache,
  CacheHeading,
  CacheLink,
  CacheEvent,
  CacheEventHandler
} from '../src/ports/MetaCache.js'
import type { ManifestItem } from '../src/types.js'

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

class NodeVaultFs implements VaultFs {
  constructor(private root: string) {}

  private full(rel: string): string {
    return path.join(this.root, rel.startsWith('/') ? rel.slice(1) : rel)
  }
  private rel(abs: string): string {
    const r = path.relative(this.root, abs).replace(/\\/g, '/')
    return '/' + r
  }

  async readFile(p: string): Promise<string> {
    return fs.readFile(this.full(p), 'utf8')
  }
  async readBinary(p: string): Promise<Uint8Array> {
    const buf = await fs.readFile(this.full(p))
    return new Uint8Array(buf)
  }
  async writeFile(p: string, content: string): Promise<void> {
    const fp = this.full(p)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, content, 'utf8')
  }
  async fileExists(p: string): Promise<boolean> {
    try {
      await fs.access(this.full(p))
      return true
    } catch {
      return false
    }
  }
  async listFiles(folder: string): Promise<string[]> {
    const folderAbs = this.full(folder)
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(folderAbs, { withFileTypes: true })
    } catch {
      return []
    }
    const out: string[] = []
    for (const ent of entries) {
      if (!ent.isFile()) continue
      out.push(this.rel(path.join(folderAbs, ent.name)))
    }
    return out
  }
  async listAllFiles(): Promise<string[]> {
    const out: string[] = []
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const ent of entries) {
        const abs = path.join(dir, ent.name)
        if (ent.isDirectory()) await walk(abs)
        else if (ent.isFile()) out.push(this.rel(abs))
      }
    }
    await walk(this.root)
    return out
  }
  async searchByName(filename: string): Promise<string[]> {
    const all = await this.listAllFiles()
    return all.filter((p) => path.basename(p) === filename)
  }
}

class NodeMetaCache implements MetaCache {
  private fm = new Map<string, Record<string, unknown>>()

  constructor(private vault: NodeVaultFs) {}

  async preload(): Promise<void> {
    const all = await this.vault.listAllFiles()
    for (const p of all) {
      if (!p.endsWith('.md')) continue
      try {
        const raw = await this.vault.readFile(p)
        const parsed = parseFrontmatter(raw)
        if (parsed) this.fm.set(p, parsed)
      } catch {
        // skip unreadable
      }
    }
  }

  override(p: string, fm: Record<string, unknown>): void {
    const existing = this.fm.get(p) ?? {}
    this.fm.set(p, { ...existing, ...fm })
  }

  getFrontmatter(p: string): Record<string, unknown> | null {
    return this.fm.get(p) ?? null
  }
  getHeadings(_p: string): CacheHeading[] {
    return []
  }
  getLinks(_p: string): CacheLink[] {
    return []
  }
  on(_e: CacheEvent, _h: CacheEventHandler): () => void {
    return () => {}
  }
}

function parseFrontmatter(raw: string): Record<string, unknown> | null {
  const m = FM_RE.exec(raw)
  if (!m) return null
  try {
    const obj = parseYaml(m[1]!) as Record<string, unknown> | null
    return obj ?? {}
  } catch {
    return {}
  }
}

const ARG_VAULT = process.argv[2]
const ARG_PUBLIC = process.argv[3]

if (!ARG_VAULT || !ARG_PUBLIC) {
  console.error('Usage: generate-sample <vault-root-abs> <public-root-abs>')
  process.exit(1)
}

async function main(): Promise<void> {
  const vault = new NodeVaultFs(ARG_VAULT!)
  const meta = new NodeMetaCache(vault)
  await meta.preload()

  // 1차 PublishIndex.build — frontmatter 'notedrop-publish: true' 인 entry 만 등록
  const index = new PublishIndex(vault, meta)
  await index.build()

  // ADR-0005 spec 의도 보강: entry 의 render='book' 인 경우, BookAssembler 가
  // 추출한 chapter 들에도 publish flag 자동 주입 → "entry 만 토글" 워크플로
  const bookAssembler = new BookAssembler(vault, meta)
  for (const entry of index.list()) {
    if (entry.render !== 'book') continue
    const plan = await bookAssembler.assemble(entry.filePath)
    for (const ch of plan.chapters) {
      meta.override(ch.filePath, { 'notedrop-publish': true })
    }
  }

  // 2차 build: chapter 포함 + linkBooks
  await index.build({ bookAssembler })

  console.log(`PublishIndex: ${index.list().length} items`)
  for (const it of index.list()) {
    const tag = it.type === 'entry' ? `${it.render}-entry` : 'chapter'
    const childCount = it.chapters ? it.chapters.length : null
    console.log(
      `  [${tag}] ${it.title} (${it.filePath})` +
        (childCount !== null ? ` chapters=${childCount}` : '') +
        (it.parent ? ` parent=${it.parent.slice(0, 8)} order=${it.order ?? '-'}` : '')
    )
  }
  if (index.warnings.length > 0) {
    for (const w of index.warnings) console.log(`  ! warning: ${w.code} ${w.message}`)
  }

  // Orchestrator pipeline
  const resolver = new ContentResolver(vault, meta, index)
  const transformer = new ContentTransformer(resolver, index, vault)
  const manifestBuilder = new ManifestBuilder(index)
  const orchestrator = new PublishOrchestrator(
    vault,
    index,
    transformer,
    manifestBuilder,
    { generatedBy: 'notedrop-sample-generator', publicRoot: '' }
  )
  const planResult = await orchestrator.plan()

  console.log(`Plan: ${planResult.files.length} files, ${planResult.warnings.length} warnings`)
  for (const w of planResult.warnings.slice(0, 12)) console.log(`  warn: ${w}`)

  const manifest = planResult.manifest

  // Clean slate: wipe content/ before write
  const contentDir = path.join(ARG_PUBLIC!, 'content')
  try {
    await fs.rm(contentDir, { recursive: true, force: true })
  } catch {
    // fresh
  }

  // Write plan files (skip auto-generated manifest — we write merged one below)
  let textCount = 0
  let binaryCount = 0
  for (const f of planResult.files) {
    if (f.path === 'manifest.json') continue
    const out = path.join(ARG_PUBLIC!, f.path)
    await fs.mkdir(path.dirname(out), { recursive: true })
    if (f.kind === 'text') {
      await fs.writeFile(out, f.content, 'utf8')
      textCount++
    } else if (f.kind === 'binary') {
      await fs.writeFile(out, f.content)
      binaryCount++
    }
  }

  // Write manifest (with welcome merged if requested)
  await fs.writeFile(
    path.join(ARG_PUBLIC!, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  )

  console.log(
    `Wrote: manifest.json + ${textCount} text + ${binaryCount} binary → ${ARG_PUBLIC}`
  )
  console.log(`Manifest items: ${manifest.items.length}`)
  for (const it of manifest.items) {
    console.log(`  - ${it.type}/${it.render} ${it.title} (hash=${it.hash.slice(0, 8)})`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
