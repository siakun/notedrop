'use client'

import { useEffect, useMemo, useState } from 'react'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer'
import Sidebar from './Sidebar'
import { fetchContent } from '@/lib/contentClient'
import { injectPageCss, removePageCss } from '@/lib/cssInjector'
import { pageSizeCss, PAGE_SIZES } from '@/lib/paginationConfig'
import { usePageSize } from '@/hooks/usePageSize'
import type { Manifest, ManifestItem } from '@/types/manifest'
import type { PageContent } from '@/types/content'

const SIZE_STYLE_ID = 'notedrop-page-size-style'

type ChapterContent = {
  item: ManifestItem
  body: string
  frontmatterCustomCss: string | null
}

export default function BookViewer({
  entry,
  manifest
}: {
  entry: PageContent
  manifest: Manifest
}) {
  const { size } = usePageSize()
  const [chapters, setChapters] = useState<ChapterContent[]>([])
  const [activeHash, setActiveHash] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const entryHash = entry.frontmatter.hash

  const entryItem = useMemo(
    () => manifest.items.find((i) => i.hash === entryHash) ?? null,
    [manifest, entryHash]
  )

  const chapterItems = useMemo<ManifestItem[]>(() => {
    if (!entryItem) return []
    const hashes = entryItem.chapters ?? []
    return hashes
      .map((h) => manifest.items.find((i) => i.hash === h))
      .filter((i): i is ManifestItem => Boolean(i))
  }, [entryItem, manifest])

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
    if (entry.frontmatter.customCss) {
      injectPageCss(entryHash, entry.frontmatter.customCss)
    }
    return () => {
      removePageCss(entryHash)
    }
  }, [entryHash, entry.frontmatter.customCss])

  useEffect(() => {
    let cancelled = false
    setChapters([])
    setError(null)
    if (chapterItems.length === 0) return
    Promise.all(chapterItems.map((it) => fetchContent(it.hash)))
      .then((results) => {
        if (cancelled) return
        setChapters(
          results.map((r, idx) => ({
            item: chapterItems[idx]!,
            body: r.body,
            frontmatterCustomCss: r.frontmatter.customCss
          }))
        )
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
      })
    return () => {
      cancelled = true
    }
  }, [chapterItems])

  useEffect(() => {
    const hashes = chapters
      .filter((c) => c.frontmatterCustomCss)
      .map((c) => c.item.hash)
    for (const c of chapters) {
      if (c.frontmatterCustomCss) injectPageCss(c.item.hash, c.frontmatterCustomCss)
    }
    return () => {
      for (const h of hashes) removePageCss(h)
    }
  }, [chapters])

  if (!entryItem) {
    return <div className="notedrop-book-error">entry 메타데이터 누락</div>
  }

  if (error) {
    return <div className="notedrop-book-error">챕터 로드 오류: {error.message}</div>
  }

  return (
    <div className="notedrop-book-shell">
      <Sidebar
        entry={entryItem}
        chapters={chapterItems}
        activeHash={activeHash}
        onSelect={(h) => {
          setActiveHash(h)
          if (typeof document !== 'undefined') {
            const target = document.getElementById(`chapter-${h}`)
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }}
      />
      <article className="notedrop-book-body">
        {entry.frontmatter.cover && (
          <section className="notedrop-book-cover">
            <img src={entry.frontmatter.cover} alt={`${entry.frontmatter.title} 표지`} />
          </section>
        )}
        <section className="notedrop-book-entry" id={`chapter-${entryHash}`}>
          <MarkdownRenderer body={entry.body} pageHash={entryHash} />
        </section>
        {chapters.map((ch) => (
          <section
            key={ch.item.hash}
            className="notedrop-book-chapter"
            id={`chapter-${ch.item.hash}`}
          >
            <h2 className="notedrop-chapter-title">{ch.item.title}</h2>
            <MarkdownRenderer body={ch.body} pageHash={ch.item.hash} />
          </section>
        ))}
      </article>
    </div>
  )
}
