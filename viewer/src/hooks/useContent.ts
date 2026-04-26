'use client'

import { useEffect, useState } from 'react'
import {
  fetchContent,
  invalidateContent,
  peekContent,
  subscribeContent
} from '@/lib/contentClient'
import type { PageContent } from '@/types/content'

export type UseContentResult = {
  content: PageContent | null
  error: Error | null
  reload: () => void
}

export function useContent(hash: string): UseContentResult {
  const [content, setContent] = useState<PageContent | null>(() => peekContent(hash))
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchContent(hash)
      .then((data) => {
        if (!cancelled) {
          setContent(data)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      })
    const unsub = subscribeContent((changedHash) => {
      if (changedHash !== hash) return
      fetchContent(hash, true)
        .then((data) => {
          if (!cancelled) setContent(data)
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
  }, [hash])

  return {
    content,
    error,
    reload: () => invalidateContent(hash)
  }
}
