'use client'

import type { LayoutMode } from '@/types/viewSettings'

export type PageIndicatorState = {
  visible: boolean
  current: number
  total: number
  layout: LayoutMode
}

export default function PageIndicator({ state }: { state: PageIndicatorState }) {
  if (!state.visible) return null
  const text =
    state.layout === 'two-pages'
      ? formatTwoPages(state.current, state.total)
      : `${state.current + 1}`
  return (
    <div className="page-indicator" aria-live="polite">
      <span>{text}</span>
      <span className="page-indicator-sep"> / </span>
      <span>{state.total}</span>
    </div>
  )
}

function formatTwoPages(current: number, total: number): string {
  const start = current + 1
  const end = Math.min(start + 1, total)
  return start === end ? `${start}` : `${start}–${end}`
}
