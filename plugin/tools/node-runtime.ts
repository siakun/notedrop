// Shared node runtime adapters for plugin/tools scripts (sample generation +
// dev sidecar). Both contexts read a vault directory from disk and produce a
// PublishIndex, so the VaultFs + MetaCache adapters can be unified.

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { parse as parseYaml } from 'yaml'

import type { VaultFs } from '../src/ports/VaultFs.js'
import type {
  MetaCache,
  CacheHeading,
  CacheLink,
  CacheEvent,
  CacheEventHandler
} from '../src/ports/MetaCache.js'

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export class NodeVaultFs implements VaultFs {
  constructor(private root: string) {}

  get rootDir(): string {
    return this.root
  }

  full(rel: string): string {
    return path.join(this.root, rel.startsWith('/') ? rel.slice(1) : rel)
  }

  rel(abs: string): string {
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
      let entries: import('node:fs').Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
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

export class NodeMetaCache implements MetaCache {
  private fm = new Map<string, Record<string, unknown>>()
  private listeners: Map<CacheEvent, Set<CacheEventHandler>> = new Map()

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

  /** Wipe in-memory state. Sidecar full rebuilds need this so that derived
   * `notedrop-publish:true` overrides applied to book chapters in a previous
   * pass don't leak when the chapter is later removed from the book — without
   * clear(), the override key persists and the orphan chapter keeps appearing
   * in the manifest until process restart. */
  clear(): void {
    this.fm.clear()
  }

  /** Re-parse frontmatter for a single path (sidecar 가 file change 시 호출). */
  async refreshFile(relPath: string): Promise<void> {
    if (!relPath.endsWith('.md')) return
    try {
      const raw = await this.vault.readFile(relPath)
      const parsed = parseFrontmatter(raw) ?? {}
      this.fm.set(relPath, parsed)
    } catch {
      this.fm.delete(relPath)
    }
  }

  evictFile(relPath: string): void {
    this.fm.delete(relPath)
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
  on(event: CacheEvent, handler: CacheEventHandler): () => void {
    let set = this.listeners.get(event)
    if (!set) { set = new Set(); this.listeners.set(event, set) }
    set.add(handler)
    return () => { set!.delete(handler) }
  }

  emit(event: CacheEvent, path: string, oldPath?: string): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const handler of set) handler(path, oldPath)
  }
}

function parseFrontmatter(raw: string): Record<string, unknown> | null {
  // Strip UTF-8 BOM — files saved by some editors (or PowerShell's
  // `[System.Text.Encoding]::UTF8`) emit `﻿` which would push `---`
  // off byte 0 and silently break frontmatter detection.
  const cleaned = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
  const m = FM_RE.exec(cleaned)
  if (!m) return null
  try {
    const obj = parseYaml(m[1]!) as Record<string, unknown> | null
    return obj ?? {}
  } catch {
    return {}
  }
}
