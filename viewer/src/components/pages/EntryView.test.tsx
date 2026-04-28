import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EntryView from './EntryView'
import type { Manifest, ManifestItem } from '@/types/manifest'

vi.stubGlobal('React', React)

const mocks = vi.hoisted(() => ({
  settings: {
    theme: 'night',
    layout: 'vertical',
    pageSize: 'A4',
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 25,
    marginRight: 25,
    font: 'system',
    fontScale: 1,
    lineScale: 1,
    align: 'left',
    showContentBounds: false
  },
  setLayoutResult: vi.fn(),
  computeLayout: vi.fn(),
  computePageFit: vi.fn(),
  applyFitDims: vi.fn()
}))

vi.mock('@/hooks/useContent', () => ({
  useContent: () => ({
    content: { body: 'body text', frontmatter: {} },
    error: null,
    reload: vi.fn()
  })
}))

vi.mock('@/hooks/useCustomCss', () => ({
  useCustomCss: vi.fn()
}))

vi.mock('@/stores/viewerStore', () => ({
  useViewSettings: () => mocks.settings,
  useSetLayoutResult: () => mocks.setLayoutResult
}))

vi.mock('@/lib/paginate', () => ({
  computeLayout: mocks.computeLayout,
  computePageFit: mocks.computePageFit,
  applyFitDims: mocks.applyFitDims
}))

vi.mock('@/components/pagination/PaginatedView', () => ({
  default: () => <div data-testid="paginated-view" />
}))

vi.mock('@/components/book/Toc', () => ({
  default: () => null
}))

vi.mock('@/components/book/ChapterNav', () => ({
  default: () => null
}))

vi.mock('@/components/markdown/MarkdownRenderer', async () => {
  const React = await import('react')

  return {
    default: function MockMarkdownRenderer(props: {
      as?: 'div' | 'section'
      className?: string
      style?: React.CSSProperties
      body: string
      pageHash?: string
      rootRef?: (root: HTMLElement | null) => void
      onContentReady?: (root: HTMLElement) => void
    }) {
      const {
        as,
        className = 'entry-content',
        style,
        body,
        pageHash,
        rootRef,
        onContentReady
      } = props
      const ref = React.useRef<HTMLElement | null>(null)
      React.useEffect(() => {
        const node = ref.current
        if (!node) return
        rootRef?.(node)
        onContentReady?.(node)
        return () => rootRef?.(null)
      }, [rootRef, onContentReady])

      return React.createElement(
        as ?? 'div',
        {
          ref,
          className,
          style,
          'data-page-hash': pageHash
        },
        React.createElement('p', { 'data-testid': 'markdown-block' }, body)
      )
    }
  }
})

const entry: ManifestItem = {
  hash: 'entry-hash',
  slug: 'entry',
  title: 'Entry',
  cover: null,
  render: 'doc',
  type: 'entry',
  parent: null,
  order: null,
  chapters: null,
  updatedAt: '2026-04-28T00:00:00.000Z'
}

const manifest: Manifest = {
  version: 1,
  generatedAt: '2026-04-28T00:00:00.000Z',
  generatedBy: 'test',
  items: [entry]
}

beforeEach(() => {
  Object.assign(mocks.settings, {
    theme: 'night',
    layout: 'vertical',
    pageSize: 'A4',
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 25,
    marginRight: 25,
    font: 'system',
    fontScale: 1,
    lineScale: 1,
    align: 'left',
    showContentBounds: false
  })
  mocks.setLayoutResult.mockReset()
  mocks.computeLayout.mockReset()
  mocks.computeLayout.mockReturnValue({ pages: [], fit: null })
  mocks.computePageFit.mockReset()
  mocks.computePageFit.mockReturnValue({
    width: 500,
    height: 700,
    padTop: 20,
    padBottom: 20,
    padLeft: 30,
    padRight: 30,
    innerHeight: 660,
    gap: 16
  })
  mocks.applyFitDims.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('EntryView measurement DOM', () => {
  it('measures fixed vertical pages from the paper page itself without applying viewport fit', async () => {
    render(
      <EntryView
        entry={entry}
        chapter={null}
        chapters={[]}
        manifest={manifest}
        renderToken={1}
      />
    )

    await waitFor(() => expect(mocks.computeLayout).toHaveBeenCalled())

    const measuredRoot = mocks.computeLayout.mock.lastCall![0] as HTMLElement
    expect(measuredRoot.classList.contains('paper-page')).toBe(true)
    expect(
      measuredRoot.querySelector(':scope > [data-testid="markdown-block"]')
    ).not.toBeNull()
    expect(measuredRoot.querySelector(':scope > .entry-content')).toBeNull()

    const hiddenRoot = document.querySelector(
      '[aria-hidden="true"]'
    ) as HTMLElement
    expect(hiddenRoot.classList.contains('entry-content')).toBe(true)
    expect(hiddenRoot.querySelector(':scope > .paper-page')).toBe(measuredRoot)

    expect(mocks.computePageFit).not.toHaveBeenCalled()
    expect(mocks.applyFitDims).not.toHaveBeenCalled()
  })

  it('wraps horizontal measurement pages in the same strip structure as visible pages', async () => {
    Object.assign(mocks.settings, { layout: 'horizontal', pageSize: 'A4' })

    render(
      <EntryView
        entry={entry}
        chapter={null}
        chapters={[]}
        manifest={manifest}
        renderToken={1}
      />
    )

    await waitFor(() => expect(mocks.computeLayout).toHaveBeenCalled())

    const hiddenRoot = document.querySelector(
      '[aria-hidden="true"]'
    ) as HTMLElement
    const strip = hiddenRoot.querySelector(':scope > .page-strip')
    const paper = strip?.querySelector(':scope > .paper-page')

    expect(hiddenRoot.classList.contains('entry-content')).toBe(true)
    expect(strip).not.toBeNull()
    expect(paper).toBe(mocks.computeLayout.mock.lastCall![0])
    expect(
      paper?.querySelector(':scope > [data-testid="markdown-block"]')
    ).not.toBeNull()
  })
})
