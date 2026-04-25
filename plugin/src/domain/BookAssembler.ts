import type { VaultFs } from '../ports/VaultFs.js'
import type { MetaCache } from '../ports/MetaCache.js'
import type { ChapterPlan } from './types.js'

const WAYPOINT_RE = /%%\s*Begin Waypoint\s*%%([\s\S]*?)%%\s*End Waypoint\s*%%/i
const WIKILINK_RE = /\[\[([^\]\n|#]+)/g
const EXCLUDED_BASENAMES: ReadonlySet<string> = new Set([
  'CLAUDE.md',
  'MOC.md',
  '원본매핑.md'
])

export class BookAssembler {
  constructor(private vault: VaultFs, private meta: MetaCache) {}

  async assemble(entryFilePath: string): Promise<ChapterPlan> {
    const wp = await this.tryWaypoint(entryFilePath)
    if (wp.length > 0) return label('waypoint', wp)
    const moc = await this.tryMoc(entryFilePath)
    if (moc.length > 0) return label('moc', moc)
    const scan = await this.tryFolderScan(entryFilePath)
    return label('folder-scan', scan)
  }

  private async tryWaypoint(entryPath: string): Promise<string[]> {
    const content = await safeRead(this.vault, entryPath)
    const block = WAYPOINT_RE.exec(content)
    if (!block) return []
    return this.resolveWikilinks(block[1]!, entryPath)
  }

  private async tryMoc(entryPath: string): Promise<string[]> {
    const folder = parentFolder(entryPath)
    const mocPath = `${folder}/MOC.md`
    if (!(await this.vault.fileExists(mocPath))) return []
    const content = await this.vault.readFile(mocPath)
    return this.resolveWikilinks(content, entryPath)
  }

  private async tryFolderScan(entryPath: string): Promise<string[]> {
    const folder = parentFolder(entryPath)
    const all = await this.vault.listFiles(folder)
    const out: string[] = []
    for (const path of all) {
      if (path === entryPath) continue
      if (!path.endsWith('.md')) continue
      const base = path.split('/').pop()!
      if (base.startsWith('_') || base.startsWith('.')) continue
      if (EXCLUDED_BASENAMES.has(base)) continue
      out.push(path)
    }
    out.sort((a, b) => naturalCompare(a, b))
    return out
  }

  private async resolveWikilinks(text: string, entryPath: string): Promise<string[]> {
    const out: string[] = []
    const folder = parentFolder(entryPath)
    for (const match of text.matchAll(WIKILINK_RE)) {
      const target = match[1]!.trim()
      if (!target) continue
      const sameFolder = `${folder}/${target}.md`
      if (await this.vault.fileExists(sameFolder)) {
        out.push(sameFolder)
        continue
      }
      const matches = await this.vault.searchByName(`${target}.md`)
      if (matches.length > 0) out.push(matches[0]!)
    }
    return out
  }
}

function label(source: ChapterPlan['source'], paths: string[]): ChapterPlan {
  return {
    source,
    chapters: paths.map((filePath, i) => ({ filePath, order: i + 1 }))
  }
}

function parentFolder(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
}

async function safeRead(vault: VaultFs, path: string): Promise<string> {
  try { return await vault.readFile(path) } catch { return '' }
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
