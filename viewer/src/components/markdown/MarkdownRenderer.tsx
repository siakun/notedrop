'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { fixAssetPaths, renderMarkdownToHtml } from '@/markdown-pipeline'

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null

async function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
        fontFamily: 'inherit'
      })
      return mermaid
    })
  }
  return mermaidPromise
}

let mermaidIdCounter = 0

async function runMermaid(root: HTMLElement, signal: () => boolean): Promise<void> {
  const blocks = root.querySelectorAll('pre.mermaid[data-source]')
  if (blocks.length === 0) return
  const mermaid = await loadMermaid()
  for (const block of Array.from(blocks)) {
    if (signal()) return
    const source = block.getAttribute('data-source') ?? block.textContent ?? ''
    const id = `notedrop-mermaid-${++mermaidIdCounter}`
    try {
      const { svg, bindFunctions } = await mermaid.render(id, source)
      const wrapper = document.createElement('div')
      wrapper.className = 'mermaid mermaid-rendered'
      wrapper.innerHTML = svg
      if (bindFunctions) bindFunctions(wrapper)
      block.replaceWith(wrapper)
    } catch (err) {
      const errBox = document.createElement('pre')
      errBox.className = 'mermaid mermaid-error'
      errBox.textContent = `mermaid 렌더 오류: ${(err as Error).message}\n\n${source}`
      block.replaceWith(errBox)
    }
  }
}

export type MarkdownRendererProps = {
  body: string
  pageHash?: string
  /**
   * 렌더 + (옵션) Mermaid 처리 후 호출. paginated layout 이 페이지네이션 진행 시점.
   */
  onContentReady?: (root: HTMLElement) => void
}

export default function MarkdownRenderer({
  body,
  pageHash,
  onContentReady
}: MarkdownRendererProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<Error | null>(null)
  const cacheKey = useMemo(() => body, [body])

  useEffect(() => {
    let cancelled = false
    const node = ref.current
    if (!node) return
    setError(null)
    node.innerHTML = ''
    renderMarkdownToHtml(cacheKey)
      .then((html) => {
        if (cancelled || !ref.current) return
        ref.current.innerHTML = fixAssetPaths(html, pageHash ?? '')
        return runMermaid(ref.current, () => cancelled)
      })
      .then(() => {
        if (cancelled || !ref.current) return
        if (onContentReady) onContentReady(ref.current)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
    return () => {
      cancelled = true
    }
  }, [cacheKey, pageHash, onContentReady])

  if (error) {
    return (
      <div className="error" role="alert">
        markdown 렌더 오류: {error.message}
      </div>
    )
  }

  return <div ref={ref} className="entry-content" data-page-hash={pageHash} />
}
