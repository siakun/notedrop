'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useManifest } from '@/hooks/useManifest'
import LiveReloadProvider from '@/components/providers/LiveReloadProvider'
import PageSizeSelector from '@/components/common/PageSizeSelector'
import ThemeToggle from '@/components/common/ThemeToggle'

export default function HomeClient() {
  const { manifest, error } = useManifest()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  if (error) {
    return (
      <main className="notedrop-home">
        <h1>오류</h1>
        <p>manifest 를 불러오지 못했습니다: {error.message}</p>
      </main>
    )
  }

  if (!manifest) {
    return (
      <main className="notedrop-home">
        <p>로딩 중…</p>
      </main>
    )
  }

  const entries = manifest.items.filter((it) => it.type === 'entry')

  return (
    <LiveReloadProvider>
      <header className="notedrop-header">
        <h1>notedrop</h1>
        <div className="notedrop-header-controls">
          <PageSizeSelector />
          <ThemeToggle />
        </div>
      </header>
      <main className="notedrop-home">
        {entries.length === 0 ? (
          <p>발행된 항목이 없습니다.</p>
        ) : (
          <ul className="notedrop-entry-list">
            {entries.map((entry) => (
              <li key={entry.hash} className="notedrop-entry-card">
                <Link href={`/${entry.slug ?? entry.hash}/`}>
                  {entry.cover && (
                    <div className="notedrop-entry-cover">
                      <img src={entry.cover} alt="" />
                    </div>
                  )}
                  <div className="notedrop-entry-meta">
                    <h2>{entry.title}</h2>
                    <p className="notedrop-entry-render">
                      {entry.render === 'book' ? '책' : '문서'}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </LiveReloadProvider>
  )
}
