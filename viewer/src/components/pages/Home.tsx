'use client'

import type { ManifestItem } from '@/types/manifest'

export default function Home({ items }: { items: ManifestItem[] }) {
  const entries = items.filter((i) => i.type === 'entry')
  if (entries.length === 0) {
    return <div className="empty">아직 발행된 노트가 없습니다.</div>
  }
  return (
    <ul className="entry-list">
      {entries.map((it) => (
        <li key={it.hash} className="entry-card">
          <a href={`#/${it.slug ?? it.hash}/`}>
            <div className="badge">{it.render === 'book' ? '책' : '문서'}</div>
            <h2>{it.title}</h2>
            <p>{formatDate(it.updatedAt)}</p>
          </a>
        </li>
      ))}
    </ul>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ko-KR')
  } catch {
    return iso
  }
}
