'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer'
import PaginatedView from '@/components/pagination/PaginatedView'
import { useContent } from '@/hooks/useContent'
import { useCustomCss } from '@/hooks/useCustomCss'
import { applyFitDims, computeLayout, computePageFit } from '@/lib/paginate'
import { useSetLayoutResult, useViewSettings } from '@/stores/viewerStore'
import type { ManifestItem } from '@/types/manifest'
import type { Manifest } from '@/types/manifest'
import Toc from '@/components/book/Toc'
import ChapterNav from '@/components/book/ChapterNav'

export type EntryViewProps = {
  entry: ManifestItem
  chapter: ManifestItem | null
  chapters: ManifestItem[]
  manifest: Manifest
  renderToken: number
}

const MEASURE_CONTAINER_STYLE: CSSProperties = {
  position: 'absolute',
  left: '-99999px',
  top: 0,
  visibility: 'hidden',
  pointerEvents: 'none'
}

const RESIZE_DEBOUNCE_MS = 200

/**
 * Entry 본문 렌더 + 페이지네이션 + customCss + book 모드 chapter 네비.
 *
 * layout='default' 면 markdown 결과 그대로. 그 외 layout 은 *off-screen measure
 * container* 안 markdown 렌더 → handleContentReady 시점에 computeLayout → store
 * dispatch → PaginatedView 가 store.pages 기반 visible render.
 *
 * cloneNode + innerHTML reset 흐름은 PaperPage 컴포넌트 안. React reconciliation
 * 활용 (페이지 component 별 useLayoutEffect, sourceGroups reference 변경 시 재배치).
 */
export default function EntryView({
  entry,
  chapter,
  chapters,
  manifest,
  renderToken
}: EntryViewProps) {
  void manifest
  const target = chapter ?? entry
  const targetHash = target.hash
  const { content, error } = useContent(targetHash)
  const settings = useViewSettings()
  const setLayoutResult = useSetLayoutResult()
  const measurePaperRef = useRef<HTMLElement | null>(null)
  const [viewportTick, setViewportTick] = useState(0)

  const isPaginate = settings.layout !== 'default'

  // window resize → debounced viewport tick. measurePaperStyle 재계산 + 재 측정 트리거.
  useEffect(() => {
    if (typeof window === 'undefined' || !isPaginate) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setViewportTick((t) => t + 1), RESIZE_DEBOUNCE_MS)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (timer) clearTimeout(timer)
    }
  }, [isPaginate])

  // settings 변경 시 MarkdownRenderer key 갱신 → unmount + remount → 새 onContentReady.
  const renderKey = useMemo(
    () =>
      `${targetHash}:${renderToken}:${settings.layout}:${settings.pageSize}` +
      `:${settings.marginTop}:${settings.marginBottom}` +
      `:${settings.marginLeft}:${settings.marginRight}` +
      `:${settings.fontScale}:${settings.lineScale}:${settings.font}`,
    [
      targetHash,
      renderToken,
      settings.layout,
      settings.pageSize,
      settings.marginTop,
      settings.marginBottom,
      settings.marginLeft,
      settings.marginRight,
      settings.fontScale,
      settings.lineScale,
      settings.font
    ]
  )

  // measure paper-page 의 inline size — visible PaperPage 와 동일해야 측정 정확.
  // vertical mm 모드 (Auto X) 는 CSS variable 사용 → fit null 이라 inline 적용 X.
  // 그 외는 computePageFit 의 viewport-fit 값 inline.
  const measurePaperStyle = useMemo<CSSProperties | undefined>(() => {
    if (!isPaginate) return undefined
    if (settings.layout === 'vertical' && settings.pageSize !== 'Auto') {
      // CSS variable 의 width/height/padding 자동 적용 — inline 안 함.
      return undefined
    }
    const fit = computePageFit(settings, settings.layout)
    if (!fit) return undefined
    return {
      width: `${fit.width}px`,
      height: `${fit.height}px`,
      padding: `${fit.padTop}px ${fit.padRight}px ${fit.padBottom}px ${fit.padLeft}px`
    }
    // viewportTick 가 dep — resize 시 재계산.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaginate, settings, viewportTick])

  useCustomCss(targetHash, content?.frontmatter.customCss ?? null)

  // markdown 렌더 완료 시점 → measure → store dispatch.
  const handleContentReady = useCallback(
    (root: HTMLElement) => {
      if (!isPaginate) return
      const result = computeLayout(root, settings, settings.layout)
      setLayoutResult(result.pages, result.fit)
    },
    [isPaginate, settings, setLayoutResult]
  )

  // viewportTick 변경 시 (resize) 재 측정. measurePaperRef 가 paper-page,
  // 자식 .entry-content 의 children 측정.
  useEffect(() => {
    if (!isPaginate || viewportTick === 0) return
    const measureEl = measurePaperRef.current
    if (!measureEl) return
    // measure paper-page 도 새 fit 반영 (inline style 갱신은 measurePaperStyle
    // useMemo 가 처리 — 이 effect 후 React re-render 가 적용)
    const newFit = computePageFit(settings, settings.layout)
    if (newFit) applyFitDims(measureEl, newFit)
    const root = measureEl.querySelector('.entry-content') as HTMLElement | null
    if (!root) return
    const result = computeLayout(root, settings, settings.layout)
    setLayoutResult(result.pages, result.fit)
  }, [viewportTick, isPaginate, settings, setLayoutResult])

  // layout='default' 진입 시 store 의 pages 비움 (PaginatedView 미사용).
  useEffect(() => {
    if (!isPaginate) {
      setLayoutResult([], null)
    }
  }, [isPaginate, setLayoutResult])

  if (error) {
    return <div className="error">콘텐츠 로드 실패: {error.message}</div>
  }
  if (!content) {
    return <div className="loading">로딩 중…</div>
  }

  const showCover = !chapter && entry.cover
  const isBook = entry.render === 'book'

  const measureMarkdown = isPaginate ? (
    <div aria-hidden="true" style={MEASURE_CONTAINER_STYLE}>
      <section
        ref={measurePaperRef}
        className="paper-page"
        style={measurePaperStyle}
      >
        <MarkdownRenderer
          key={renderKey}
          body={content.body}
          pageHash={targetHash}
          onContentReady={handleContentReady}
        />
      </section>
    </div>
  ) : null

  const visibleMarkdown = isPaginate ? (
    <PaginatedView layout={settings.layout} />
  ) : (
    <MarkdownRenderer
      key={renderKey}
      body={content.body}
      pageHash={targetHash}
    />
  )

  if (isBook) {
    const idx = chapter
      ? chapters.findIndex((c) => c.hash === chapter.hash)
      : -1
    const prev = idx > 0 ? chapters[idx - 1]! : null
    const next =
      idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1]! : null

    return (
      <>
        {measureMarkdown}
        <Toc
          book={entry}
          chapters={chapters}
          activeHash={chapter?.hash ?? entry.hash}
        />
        <article>
          {showCover && entry.cover && (
            <img
              className="cover"
              src={normalizeAsset(entry.cover)}
              alt={`${entry.title} 표지`}
            />
          )}
          {visibleMarkdown}
          <ChapterNav book={entry} prev={prev} next={next} />
        </article>
      </>
    )
  }

  return (
    <>
      {measureMarkdown}
      <article>
        {showCover && entry.cover && (
          <img
            className="cover"
            src={normalizeAsset(entry.cover)}
            alt={`${entry.title} 표지`}
          />
        )}
        {visibleMarkdown}
      </article>
    </>
  )
}

function normalizeAsset(p: string): string {
  return p.startsWith('/') ? p.slice(1) : p
}
