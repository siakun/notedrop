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
 * Zustand pages state 기반 paper-page render. 항상 `<div class="entry-content">`
 * 으로 wrap — globals.css 의 markdown 스타일 (.entry-content p / h1 등) +
 * vertical layout 의 flex column + align-items: center + gap 자동 적용.
 *
 * layout 별 차이:
 *  - vertical: .entry-content 안 paper-page 들 직접 children (flex column gap).
 *  - horizontal/two-pages: .entry-content > .page-strip > paper-page 들 +
 *    useStripNavigation hook (wheel/keydown/transform).
 */
export default function PaginatedView({ layout }: PaginatedViewProps) {
  const { pages, fit } = usePaginateResult()
  const stripRef = useRef<HTMLDivElement>(null)

  useStripNavigation(stripRef, layout, pages.length)

  const setIndicator = useSetIndicator()
  useEffect(() => {
    if (layout === 'vertical' || layout === 'default') {
      setIndicator({ visible: false, current: 0, total: 0, layout })
    }
  }, [layout, setIndicator])

  if (pages.length === 0) return null

  const isStrip = layout === 'horizontal' || layout === 'two-pages'

  return (
    <div className="entry-content">
      {isStrip ? (
        <div className="page-strip" ref={stripRef}>
          {pages.map((p, i) => (
            <PaperPage key={i} sourceGroups={p.sourceGroups} fit={fit} />
          ))}
        </div>
      ) : (
        pages.map((p, i) => (
          <PaperPage key={i} sourceGroups={p.sourceGroups} fit={fit} />
        ))
      )}
    </div>
  )
}
