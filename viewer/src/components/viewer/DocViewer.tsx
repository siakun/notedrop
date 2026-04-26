'use client'

import { useEffect, useRef, useState } from 'react'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer'
import { injectPageCss, removePageCss } from '@/lib/cssInjector'
import { pageSizeCss, PAGE_SIZES } from '@/lib/paginationConfig'
import { usePageSize } from '@/hooks/usePageSize'
import type { PageContent } from '@/types/content'

const SIZE_STYLE_ID = 'notedrop-page-size-style'

export default function DocViewer({ content }: { content: PageContent }) {
  const { size } = usePageSize()
  const sourceRef = useRef<HTMLDivElement>(null)
  const targetRef = useRef<HTMLDivElement>(null)
  const [paginated, setPaginated] = useState(false)
  const hash = content.frontmatter.hash || 'doc'

  useEffect(() => {
    if (typeof document === 'undefined') return
    const style = document.getElementById(SIZE_STYLE_ID) ?? document.createElement('style')
    style.id = SIZE_STYLE_ID
    style.textContent = pageSizeCss(PAGE_SIZES[size])
    if (!style.isConnected) document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [size])

  useEffect(() => {
    if (content.frontmatter.customCss) {
      injectPageCss(hash, content.frontmatter.customCss)
    }
    return () => {
      removePageCss(hash)
    }
  }, [hash, content.frontmatter.customCss])

  useEffect(() => {
    if (!sourceRef.current || !targetRef.current) return
    let cancelled = false
    setPaginated(false)
    const target = targetRef.current
    const source = sourceRef.current
    const start = async () => {
      try {
        const mod = await import('pagedjs')
        if (cancelled) return
        target.innerHTML = ''
        const Previewer = (mod as { Previewer?: new () => { preview: (s: HTMLElement, st: string[], t: HTMLElement) => Promise<void> } }).Previewer
          ?? (mod as { default?: { Previewer: new () => { preview: (s: HTMLElement, st: string[], t: HTMLElement) => Promise<void> } } }).default?.Previewer
        if (!Previewer) {
          target.appendChild(source.cloneNode(true))
          setPaginated(true)
          return
        }
        const previewer = new Previewer()
        const clone = source.cloneNode(true) as HTMLElement
        clone.style.display = 'block'
        await previewer.preview(clone, [], target)
        if (!cancelled) setPaginated(true)
      } catch {
        if (!cancelled && targetRef.current && sourceRef.current) {
          targetRef.current.innerHTML = ''
          targetRef.current.appendChild(sourceRef.current.cloneNode(true))
          setPaginated(true)
        }
      }
    }
    const timer = setTimeout(start, 50)
    return () => {
      cancelled = true
      clearTimeout(timer)
      if (target) target.innerHTML = ''
    }
  }, [content.body, size])

  return (
    <div className="notedrop-paged-shell">
      <div ref={sourceRef} className="notedrop-paged-source" style={{ display: 'none' }}>
        <MarkdownRenderer body={content.body} pageHash={hash} />
      </div>
      <div ref={targetRef} className="notedrop-paged-target" data-paginated={paginated} />
    </div>
  )
}
