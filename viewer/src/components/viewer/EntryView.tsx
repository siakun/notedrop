'use client'

import { useEffect, useRef, useState } from 'react'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer'
import { useViewSettings } from '@/components/providers/ViewSettingsProvider'
import { useContent } from '@/hooks/useContent'
import {
  paginateStrip,
  paginateVertical,
  unpaginate
} from '@/lib/paginate'
import { StripController } from '@/lib/stripController'
import type { ManifestItem } from '@/types/manifest'
import type { PageIndicatorState } from './PageIndicator'
import Toc from './Toc'
import ChapterNav from './ChapterNav'

export type EntryViewProps = {
  entry: ManifestItem
  chapter: ManifestItem | null
  chapters: ManifestItem[]
  renderToken: number
  onIndicator: (state: PageIndicatorState) => void
}

export default function EntryView({
  entry,
  chapter,
  chapters,
  renderToken,
  onIndicator
}: EntryViewProps) {
  const target = chapter ?? entry
  const targetHash = target.hash
  const { content, error } = useContent(targetHash)
  const { settings } = useViewSettings()
  const articleRef = useRef<HTMLElement | null>(null)
  const stripControllerRef = useRef<StripController | null>(null)
  const [customCssEl, setCustomCssEl] = useState<HTMLStyleElement | null>(null)

  // Reset paged content + indicator when route or layout/page-size/margin changes.
  // We rebuild pagination on every settings change that affects layout.
  useEffect(() => {
    return () => {
      if (stripControllerRef.current) {
        stripControllerRef.current.destroy()
        stripControllerRef.current = null
      }
    }
  }, [])

  // Apply customCss for entry (book or doc). Chapter 의 customCss 는 무시 — entry 단위 일관성.
  useEffect(() => {
    const css = entry.cover ? null : null
    void css
    if (customCssEl) {
      customCssEl.remove()
      setCustomCssEl(null)
    }
    const raw = content?.frontmatter?.customCss ?? null
    if (!raw) return
    const style = document.createElement('style')
    style.dataset.notedrop = 'custom-css'
    style.textContent = `.entry-content { ${raw} }`
    document.head.appendChild(style)
    setCustomCssEl(style)
    return () => {
      style.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content?.frontmatter?.customCss, targetHash])

  const handleContentReady = (root: HTMLElement) => {
    if (stripControllerRef.current) {
      stripControllerRef.current.destroy()
      stripControllerRef.current = null
    }
    unpaginate(root)
    if (settings.layout === 'vertical') {
      paginateVertical(root, settings)
      onIndicator({ visible: false, current: 0, total: 0, layout: settings.layout })
    } else if (settings.layout === 'horizontal' || settings.layout === 'two-pages') {
      const result = paginateStrip(root, settings, settings.layout)
      if (result) {
        const controller = new StripController(
          result.strip,
          settings.layout,
          result.totalPages,
          (current, total, layout) =>
            onIndicator({ visible: true, current, total, layout })
        )
        stripControllerRef.current = controller
      } else {
        onIndicator({ visible: false, current: 0, total: 0, layout: settings.layout })
      }
    } else {
      onIndicator({ visible: false, current: 0, total: 0, layout: settings.layout })
    }
  }

  if (error) {
    return <div className="error">콘텐츠 로드 실패: {error.message}</div>
  }
  if (!content) {
    return <div className="loading">로딩 중…</div>
  }

  const showCover = !chapter && entry.cover
  const isBook = entry.render === 'book'

  if (isBook) {
    const idx = chapter
      ? chapters.findIndex((c) => c.hash === chapter.hash)
      : -1
    const prev = idx > 0 ? chapters[idx - 1]! : null
    const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1]! : null

    return (
      <>
        <Toc
          book={entry}
          chapters={chapters}
          activeHash={chapter?.hash ?? entry.hash}
        />
        <article ref={(el) => { articleRef.current = el }}>
          {showCover && entry.cover && (
            <img className="cover" src={normalizeAsset(entry.cover)} alt="cover" />
          )}
          <MarkdownRenderer
            key={`${targetHash}:${renderToken}:${settings.layout}:${settings.pageSize}:${settings.marginTop}:${settings.marginBottom}:${settings.marginLeft}:${settings.marginRight}`}
            body={content.body}
            pageHash={targetHash}
            onContentReady={handleContentReady}
          />
          <ChapterNav book={entry} prev={prev} next={next} />
        </article>
      </>
    )
  }

  return (
    <article ref={(el) => { articleRef.current = el }}>
      {showCover && entry.cover && (
        <img className="cover" src={normalizeAsset(entry.cover)} alt="cover" />
      )}
      <MarkdownRenderer
        key={`${targetHash}:${renderToken}:${settings.layout}:${settings.pageSize}:${settings.marginTop}:${settings.marginBottom}:${settings.marginLeft}:${settings.marginRight}`}
        body={content.body}
        pageHash={targetHash}
        onContentReady={handleContentReady}
      />
    </article>
  )
}

function normalizeAsset(p: string): string {
  return p.startsWith('/') ? p.slice(1) : p
}
