import type { LayoutMode, ViewSettings } from '@/types/viewSettings'
import { PAGE_DIMS } from '@/types/viewSettings'
import {
  buildLineStream,
  groupLinesBySource,
  splitByLineHeight,
  type SourceGroup
} from './lineStream'
import { createPretextMeasurer, createRichInlineMeasurer } from './paragraphSplit'

/**
 * 한 페이지의 데이터. PaperPage 컴포넌트가 source 들을 cloneNode/extract 해서
 * mount. SourceGroup 의 source 는 *measure container* 의 원본 element reference.
 */
export type PageData = {
  sourceGroups: SourceGroup[]
  layout: LayoutMode
}

export type LayoutResult = {
  pages: PageData[]
  fit: PageFit | null
}

export function mmToPx(mm: number): number {
  return mm * (96 / 25.4)
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export type PageFit = {
  width: number
  height: number
  padTop: number
  padBottom: number
  padLeft: number
  padRight: number
  innerHeight: number
  gap: number
}

/**
 * 페이지 크기 결정. pageSize='Auto' 또는 mm 단위 크기가 viewport 보다 크면
 * viewport-fit 적용. mm 단위 + viewport 안 들어맞으면 그대로 mm 사용.
 *
 * 모든 layout 에서 동일 알고리즘 — 일관성 의무 (사용자 결정 v0.1.53).
 */
export function computePageFit(
  settings: ViewSettings,
  layout: LayoutMode
): PageFit | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  const dims = PAGE_DIMS[settings.pageSize]
  const headerH =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--header-height'
      )
    ) || 56
  const viewportH = window.innerHeight - headerH - 32
  const viewportW = window.innerWidth - 32
  if (viewportH <= 0 || viewportW <= 0) return null

  const ratio = dims.w / dims.h
  const gap = 16
  const horizPaddingExtra = 32

  let pageWidth: number
  let pageHeight: number

  if (settings.pageSize === 'Auto') {
    pageHeight = viewportH - 32
    pageWidth = pageHeight * ratio
  } else {
    pageWidth = mmToPx(dims.w)
    pageHeight = mmToPx(dims.h)
  }

  const widthBudget =
    layout === 'two-pages'
      ? (viewportW - gap - horizPaddingExtra * 2) / 2
      : viewportW - horizPaddingExtra * 2
  if (widthBudget < pageWidth) {
    pageWidth = widthBudget
    pageHeight = pageWidth / ratio
  }

  const heightBudget = viewportH - 32
  if (heightBudget < pageHeight) {
    pageHeight = heightBudget
    pageWidth = pageHeight * ratio
  }

  if (pageHeight <= 0 || pageWidth <= 0) return null

  // Margins are user-facing visual spacing; keep them independent from
  // page-size viewport scaling so Auto/B/A variants do not drift.
  const padTop = mmToPx(settings.marginTop)
  const padBottom = mmToPx(settings.marginBottom)
  const padLeft = mmToPx(settings.marginLeft)
  const padRight = mmToPx(settings.marginRight)
  const innerHeight = pageHeight - padTop - padBottom

  return {
    width: pageWidth,
    height: pageHeight,
    padTop,
    padBottom,
    padLeft,
    padRight,
    innerHeight,
    gap
  }
}

export function applyFitDims(pageEl: HTMLElement, fit: PageFit): void {
  pageEl.style.width = `${fit.width}px`
  pageEl.style.height = `${fit.height}px`
  pageEl.style.padding = `${fit.padTop}px ${fit.padRight}px ${fit.padBottom}px ${fit.padLeft}px`
}

/**
 * 측정 + paginate. content (markdown 렌더된 children 컨테이너) 입력 → LayoutResult
 * 반환. content 의 children 자체를 측정 — content 는 정확한 width/styles 를
 * 갖는 measure container 의무 (off-screen paper-page).
 *
 * **Side effect 없음** — content 의 children 변경 X. PageData.sourceGroups 의 source
 * reference 가 content 안 element. PaperPage 컴포넌트가 mount 시 cloneNode + 필요
 * 시 extractCharRange.
 */
export function computeLayout(
  content: HTMLElement,
  settings: ViewSettings,
  layout: LayoutMode
): LayoutResult {
  if (layout === 'default') return { pages: [], fit: null }

  const flat = Array.from(content.children) as HTMLElement[]
  if (flat.length === 0) return { pages: [], fit: null }

  let innerHeightPx: number
  let innerWidthPx: number
  let fit: PageFit | null = null

  if (layout === 'vertical' && settings.pageSize === 'Auto') {
    fit = computePageFit(settings, layout)
    if (!fit) return { pages: [], fit: null }
    innerHeightPx = fit.innerHeight
    innerWidthPx = fit.width - fit.padLeft - fit.padRight
  } else if (layout === 'vertical') {
    const dims = PAGE_DIMS[settings.pageSize]
    innerHeightPx = mmToPx(dims.h - settings.marginTop - settings.marginBottom)
    innerWidthPx = mmToPx(dims.w - settings.marginLeft - settings.marginRight)
  } else {
    fit = computePageFit(settings, layout)
    if (!fit) return { pages: [], fit: null }
    innerHeightPx = fit.innerHeight
    innerWidthPx = fit.width - fit.padLeft - fit.padRight
  }

  if (innerHeightPx <= 0 || innerWidthPx <= 0) return { pages: [], fit }

  const lineStream = buildLineStream(
    flat,
    { innerWidthPx, innerHeightPx },
    createPretextMeasurer(),
    createRichInlineMeasurer()
  )
  const lineGroups = splitByLineHeight(lineStream, innerHeightPx)

  const pages: PageData[] = lineGroups.map((group) => ({
    sourceGroups: groupLinesBySource(group),
    layout
  }))

  return { pages, fit }
}
