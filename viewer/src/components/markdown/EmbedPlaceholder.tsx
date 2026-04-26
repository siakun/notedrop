import type { ReactNode } from 'react'

export default function EmbedPlaceholder({ children }: { children?: ReactNode }) {
  return (
    <div className="notedrop-embed-placeholder" role="note">
      {children}
    </div>
  )
}

export function EmbedOverflow({ children }: { children?: ReactNode }) {
  return (
    <div className="notedrop-embed-overflow" role="note">
      {children ?? '(임베드 깊이 초과)'}
    </div>
  )
}
