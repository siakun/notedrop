'use client'

import { useEffect, useMemo, useState } from 'react'
import { renderMarkdown } from '@/markdown-pipeline'

export type MarkdownRendererProps = {
  body: string
  pageHash?: string
}

export default function MarkdownRenderer({ body, pageHash }: MarkdownRendererProps) {
  const [content, setContent] = useState<unknown>(null)
  const [error, setError] = useState<Error | null>(null)
  const cacheKey = useMemo(() => body, [body])

  useEffect(() => {
    let cancelled = false
    setError(null)
    renderMarkdown(cacheKey)
      .then((tree) => {
        if (!cancelled) setContent(tree)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      })
    return () => {
      cancelled = true
    }
  }, [cacheKey])

  if (error) {
    return (
      <div className="notedrop-markdown-error" role="alert">
        markdown 렌더 오류: {error.message}
      </div>
    )
  }

  if (content === null) {
    return <div className="notedrop-markdown-loading" aria-busy="true" />
  }

  return (
    <div className="notedrop-content" data-page-hash={pageHash}>
      {content as React.ReactNode}
    </div>
  )
}
