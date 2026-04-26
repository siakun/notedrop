import type { ReactNode } from 'react'

export default function DeadLink({ children }: { children?: ReactNode }) {
  return (
    <span className="notedrop-deadlink" role="text" aria-label="접근 권한이 없는 링크">
      {children}
    </span>
  )
}
