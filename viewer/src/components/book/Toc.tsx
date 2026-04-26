'use client'

import type { ManifestItem } from '@/types/manifest'

export type TocProps = {
  book: ManifestItem
  chapters: ManifestItem[]
  activeHash: string
}

export default function Toc({ book, chapters, activeHash }: TocProps) {
  return (
    <aside className="toc">
      <h3>{book.title}</h3>
      <ol>
        <li>
          <a
            href={`#/${book.slug ?? book.hash}/`}
            className={activeHash === book.hash ? 'active' : ''}
          >
            서문
          </a>
        </li>
        {chapters.map((c, i) => (
          <li key={c.hash}>
            <a
              href={`#/${c.slug ?? c.hash}/`}
              className={c.hash === activeHash ? 'active' : ''}
            >
              {i + 1}. {c.title}
            </a>
          </li>
        ))}
      </ol>
    </aside>
  )
}
