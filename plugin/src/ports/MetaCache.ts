export type CacheHeading = { heading: string, level: number }
export type CacheLink = { link: string, displayText?: string }
export type CacheEvent = 'changed' | 'deleted' | 'renamed'
export type CacheEventHandler = (path: string, oldPath?: string) => void

export interface MetaCache {
  getFrontmatter(path: string): Record<string, unknown> | null
  getHeadings(path: string): CacheHeading[]
  getLinks(path: string): CacheLink[]
  on(event: CacheEvent, handler: CacheEventHandler): () => void
}
