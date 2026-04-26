'use client'

import type { ManifestItem } from '@/types/manifest'

export type SidebarProps = {
  entry: ManifestItem
  chapters: ManifestItem[]
  activeHash: string | null
  onSelect?: (hash: string) => void
}

export default function Sidebar({ entry, chapters, activeHash, onSelect }: SidebarProps) {
  return (
    <nav className="notedrop-sidebar" aria-label="챕터 목차">
      <header className="notedrop-sidebar-entry">
        <a
          href={`#/${entry.slug ?? entry.hash}/`}
          onClick={(e) => {
            if (onSelect) {
              e.preventDefault()
              onSelect(entry.hash)
            }
          }}
        >
          {entry.title}
        </a>
      </header>
      <ol className="notedrop-sidebar-chapters">
        {chapters.map((ch) => (
          <li
            key={ch.hash}
            className={
              ch.hash === activeHash
                ? 'notedrop-sidebar-chapter is-active'
                : 'notedrop-sidebar-chapter'
            }
          >
            <a
              href={`#chapter-${ch.hash}`}
              onClick={(e) => {
                if (onSelect) {
                  e.preventDefault()
                  onSelect(ch.hash)
                }
              }}
            >
              {ch.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
