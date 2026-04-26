import type { Manifest } from '@/types/manifest'
import { Resource } from './resource'
import { logger } from './logger'

const SINGLETON_KEY = '__manifest__'

const resource = new Resource<Manifest>(async () => {
  const res = await fetch('manifest.json', { cache: 'no-store' })
  if (!res.ok) {
    logger.error('manifest', `fetch failed: ${res.status}`)
    throw new Error(`manifest fetch failed: ${res.status}`)
  }
  const data = (await res.json()) as Manifest
  logger.debug('manifest', 'fetched', { itemsCount: data.items.length })
  return data
})

export function fetchManifest(force = false): Promise<Manifest> {
  return resource.get(SINGLETON_KEY, force)
}

export function invalidateManifest(): void {
  resource.invalidate(SINGLETON_KEY)
}

export function subscribeManifest(fn: () => void): () => void {
  return resource.subscribe(() => fn())
}

export function peekManifest(): Manifest | null {
  return resource.peek(SINGLETON_KEY)
}
