import type { App, EventRef, TAbstractFile, TFile } from 'obsidian'
import type {
  MetaCache,
  CacheHeading,
  CacheLink,
  CacheEvent,
  CacheEventHandler
} from '../ports/MetaCache.js'

export class ObsidianMetaCache implements MetaCache {
  constructor(private app: App) {}

  getFrontmatter(path: string): Record<string, unknown> | null {
    const file = this.toFile(path)
    if (!file) return null
    const cache = this.app.metadataCache.getFileCache(file)
    return (cache?.frontmatter as Record<string, unknown> | undefined) ?? null
  }

  getHeadings(path: string): CacheHeading[] {
    const file = this.toFile(path)
    if (!file) return []
    const cache = this.app.metadataCache.getFileCache(file)
    return (cache?.headings ?? []).map((h) => ({
      heading: h.heading,
      level: h.level
    }))
  }

  getLinks(path: string): CacheLink[] {
    const file = this.toFile(path)
    if (!file) return []
    const cache = this.app.metadataCache.getFileCache(file)
    const links: CacheLink[] = []
    for (const l of cache?.links ?? []) {
      links.push({ link: l.link, displayText: l.displayText })
    }
    for (const e of cache?.embeds ?? []) {
      links.push({ link: e.link, displayText: e.displayText })
    }
    return links
  }

  on(event: CacheEvent, handler: CacheEventHandler): () => void {
    let ref: EventRef
    if (event === 'changed') {
      ref = this.app.metadataCache.on('changed', (file: TFile) => {
        handler(file.path)
      })
      return () => { this.app.metadataCache.offref(ref) }
    }
    if (event === 'deleted') {
      ref = this.app.vault.on('delete', (file: TAbstractFile) => {
        handler(file.path)
      })
      return () => { this.app.vault.offref(ref) }
    }
    ref = this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
      handler(file.path, oldPath)
    })
    return () => { this.app.vault.offref(ref) }
  }

  private toFile(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(path)
    if (!f) return null
    if (!('stat' in f) || !('extension' in f)) return null
    return f as TFile
  }
}
