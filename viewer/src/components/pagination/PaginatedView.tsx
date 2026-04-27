'use client'

import { useEffect, useRef } from 'react'
import PaperPage from './PaperPage'
import { usePaginateResult, useSetIndicator } from '@/stores/viewerStore'
import { useStripNavigation } from '@/hooks/useStripNavigation'
import type { LayoutMode } from '@/types/viewSettings'

type PaginatedViewProps = {
  layout: LayoutMode
}

/**
 * Zustand pages state 기반 paper-page render. layout 별로 컨테이너 차이:
 *  - vertical: paper-page 들 그대로 children flow.
 *  - horizontal/two-pages: .page-strip 으로 wrap + StripController (useStripNavigation hook).
 */
export default function PaginatedView({ layout }: PaginatedViewProps) {
  const { pages, fit } = usePaginateResult()
  const stripRef = useRef<HTMLDivElement>(null)

  // strip 이 있는 layout 만 navigation hook 활성
  useStripNavigation(stripRef, layout, pages.length)

  // vertical / default — indicator 숨김 (StripController 가 띄움)
  const setIndicator = useSetIndicator()
  useEffect(() => {
    if (layout === 'vertical' || layout === 'default') {
      setIndicator({ visible: false, current: 0, total: 0, layout })
    }
  }, [layout, setIndicator])

  if (pages.length === 0) return null

  if (layout === 'horizontal' || layout === 'two-pages') {
    return (
      <div className="page-strip" ref={stripRef}>
        {pages.map((p, i) => (
          <PaperPage key={i} sourceGroups={p.sourceGroups} fit={fit} />
        ))}
      </div>
    )
  }

  // vertical
  return (
    <>
      {pages.map((p, i) => (
        <PaperPage key={i} sourceGroups={p.sourceGroups} fit={fit} />
      ))}
    </>
  )
}
