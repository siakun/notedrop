'use client'

import { useEffect, useState } from 'react'
import { useContent } from '@/hooks/useContent'
import { useManifest } from '@/hooks/useManifest'
import BookViewer from './BookViewer'
import DocViewer from './DocViewer'
import LiveReloadProvider from '@/components/providers/LiveReloadProvider'
import PageSizeSelector from '@/components/common/PageSizeSelector'
import DownloadPDFButton from '@/components/common/DownloadPDFButton'
import ThemeToggle from '@/components/common/ThemeToggle'

export default function EntryClient({ hash }: { hash: string }) {
  const { content, error } = useContent(hash)
  const { manifest } = useManifest()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  if (error) {
    return (
      <main className="notedrop-entry">
        <a href="#/">← 홈</a>
        <h1>오류</h1>
        <p>{error.message}</p>
      </main>
    )
  }

  if (!content || !manifest) {
    return (
      <main className="notedrop-entry">
        <p>로딩 중…</p>
      </main>
    )
  }

  return (
    <LiveReloadProvider>
      <header className="notedrop-header">
        <a href="#/">← 홈</a>
        <h1>{content.frontmatter.title}</h1>
        <div className="notedrop-header-controls">
          <PageSizeSelector />
          <DownloadPDFButton />
          <ThemeToggle />
        </div>
      </header>
      {content.frontmatter.render === 'book' ? (
        <BookViewer entry={content} manifest={manifest} />
      ) : (
        <DocViewer content={content} />
      )}
    </LiveReloadProvider>
  )
}
