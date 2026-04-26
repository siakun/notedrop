import type { Manifest } from '@/types/manifest'

let cached: Manifest | null = null
let inflight: Promise<Manifest> | null = null
const subscribers = new Set<() => void>()

export async function fetchManifest(force = false): Promise<Manifest> {
  if (!force && cached) return cached
  if (!force && inflight) return inflight
  inflight = (async () => {
    const res = await fetch('manifest.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`)
    const data = (await res.json()) as Manifest
    cached = data
    return data
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function invalidateManifest(): void {
  cached = null
  for (const fn of subscribers) {
    try { fn() } catch {}
  }
}

export function subscribeManifest(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function peekManifest(): Manifest | null {
  return cached
}
