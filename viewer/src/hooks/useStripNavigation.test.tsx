import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import React, { useRef } from 'react'
import { useStripNavigation } from './useStripNavigation'
import { useViewerStore } from '@/stores/viewerStore'
import type { LayoutMode } from '@/types/viewSettings'

function StripHarness({
  layout,
  total
}: {
  layout: LayoutMode
  total: number
}) {
  const stripRef = useRef<HTMLDivElement>(null)
  useStripNavigation(stripRef, layout, total)
  return (
    <div>
      <div ref={stripRef} />
    </div>
  )
}

beforeEach(() => {
  useViewerStore.setState({
    indicator: { visible: false, current: 0, total: 0, layout: 'default' }
  })
})

afterEach(() => {
  cleanup()
})

describe('useStripNavigation', () => {
  it('hides the strip indicator when there are no pages', async () => {
    render(<StripHarness layout="horizontal" total={0} />)

    await waitFor(() => {
      const indicator = useViewerStore.getState().indicator
      expect(indicator.layout).toBe('horizontal')
      expect(indicator.visible).toBe(false)
      expect(indicator.current).toBe(0)
      expect(indicator.total).toBe(0)
    })
  })
})
