'use client'

import type { ManifestItem } from '@/types/manifest'

export default function ChapterNav({
  book,
  prev,
  next
}: {
  book: ManifestItem
  prev: ManifestItem | null
  next: ManifestItem | null
}) {
  if (!prev && !next) return null
  void book
  return (
    <nav className="chapter-nav">
      <a
        className={prev ? '' : 'disabled'}
        href={prev ? `#/${prev.slug ?? prev.hash}/` : '#'}
      >
        ← {prev ? prev.title : ''}
      </a>
      <a
        className={next ? '' : 'disabled'}
        href={next ? `#/${next.slug ?? next.hash}/` : '#'}
      >
        {next ? next.title : ''} →
      </a>
    </nav>
  )
}
