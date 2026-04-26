'use client'

import { useEffect, useState } from 'react'
import {
  fetchManifest,
  invalidateManifest,
  peekManifest,
  subscribeManifest
} from '@/lib/manifestClient'
import type { Manifest } from '@/types/manifest'

export type UseManifestResult = {
  manifest: Manifest | null
  error: Error | null
  reload: () => void
}

export function useManifest(): UseManifestResult {
  const [manifest, setManifest] = useState<Manifest | null>(() => peekManifest())
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchManifest()
      .then((data) => {
        if (!cancelled) {
          setManifest(data)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      })
    const unsub = subscribeManifest(() => {
      fetchManifest(true)
        .then((data) => {
          if (!cancelled) setManifest(data)
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(err instanceof Error ? err : new Error(String(err)))
          }
        })
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  return {
    manifest,
    error,
    reload: () => invalidateManifest()
  }
}
