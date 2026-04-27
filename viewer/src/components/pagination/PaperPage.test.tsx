import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PaperPage from './PaperPage'
import type { PageFit } from '@/lib/paginate'

vi.stubGlobal('React', React)

const fit: PageFit = {
  width: 640,
  height: 900,
  padTop: 24,
  padBottom: 28,
  padLeft: 32,
  padRight: 36,
  innerHeight: 848,
  gap: 16
}

afterEach(() => {
  cleanup()
})

describe('PaperPage', () => {
  it('clears inline sizing when fit is removed', () => {
    const { container, rerender } = render(
      <PaperPage sourceGroups={[]} fit={fit} />
    )
    const page = container.querySelector('.paper-page') as HTMLElement

    expect(page.style.width).toBe('640px')
    expect(page.style.height).toBe('900px')
    expect(page.style.padding).toBe('24px 36px 28px 32px')

    rerender(<PaperPage sourceGroups={[]} fit={null} />)

    expect(page.style.width).toBe('')
    expect(page.style.height).toBe('')
    expect(page.style.padding).toBe('')
  })
})
