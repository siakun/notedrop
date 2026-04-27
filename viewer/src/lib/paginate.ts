import type { LayoutMode, ViewSettings } from '@/types/viewSettings'
import { PAGE_DIMS } from '@/types/viewSettings'
import {
  buildLineStream,
  renderLineGroups,
  splitByLineHeight
} from './lineStream'
import { createPretextMeasurer } from './paragraphSplit'

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
 * 페이지 크기 결정. pageSize='auto' 또는 mm 단위 크기가 viewport 보다 크면
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
    // viewport-fit (기존 horizontal/two-pages 동작)
    pageHeight = viewportH - 32
    pageWidth = pageHeight * ratio
  } else {
    // mm 단위 시도
    pageWidth = mmToPx(dims.w)
    pageHeight = mmToPx(dims.h)
  }

  // width budget 검사 — viewport 가 작으면 fit
  const widthBudget =
    layout === 'two-pages'
      ? (viewportW - gap - horizPaddingExtra * 2) / 2
      : viewportW - horizPaddingExtra * 2
  if (widthBudget < pageWidth) {
    pageWidth = widthBudget
    pageHeight = pageWidth / ratio
  }

  // height budget 검사 — viewport 가 작으면 fit (mm 단위가 viewport 보다 큰 케이스)
  const heightBudget = viewportH - 32
  if (heightBudget < pageHeight) {
    pageHeight = heightBudget
    pageWidth = pageHeight * ratio
  }

  if (pageHeight <= 0 || pageWidth <= 0) return null

  const scale = pageHeight / mmToPx(dims.h)
  const padTop = mmToPx(settings.marginTop) * scale
  const padBottom = mmToPx(settings.marginBottom) * scale
  const padLeft = mmToPx(settings.marginLeft) * scale
  const padRight = mmToPx(settings.marginRight) * scale
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

export function createPaperPage(): HTMLElement {
  const page = document.createElement('section')
  page.className = 'paper-page'
  return page
}

export function unpaginate(content: HTMLElement): void {
  const strip = content.querySelector(':scope > .page-strip')
  if (strip) {
    const flat: ChildNode[] = []
    for (const page of Array.from(strip.children)) {
      flat.push(...Array.from(page.childNodes))
    }
    content.innerHTML = ''
    for (const c of flat) {
      if (c instanceof HTMLElement) {
        c.style.removeProperty('width')
        c.style.removeProperty('height')
      }
      content.appendChild(c)
    }
    return
  }
  const sections = content.querySelectorAll(':scope > .paper-page')
  if (sections.length === 0) return
  for (const sec of Array.from(sections)) {
    while (sec.firstChild) {
      content.insertBefore(sec.firstChild, sec)
    }
    sec.remove()
  }
}

/**
 * Vertical scroll paginate. line 단위 알고리즘:
 *   1. measure 컨테이너 (paper-page) 에 children 임시 배치 — font/offsetHeight 측정 가능
 *   2. buildLineStream → element 들을 Line[] 으로 분해
 *   3. splitByLineHeight → Line[] → page groups
 *   4. renderLineGroups → 각 group 마다 paper-page 생성 + line 들을 source 별로 다시 묶음
 *
 * pageSize === 'auto' 인 경우 mm 고정 대신 computePageFit 결과 (viewport-fit) 를
 * 사용하고 paper-page 에 inline style 로 width/height/padding 적용.
 */
export function paginateVertical(
  content: HTMLElement,
  settings: ViewSettings
): void {
  const flat = Array.from(content.children) as HTMLElement[]
  if (flat.length === 0) return

  let innerHeightPx: number
  let innerWidthPx: number
  let fit: PageFit | null = null

  if (settings.pageSize === 'Auto') {
    fit = computePageFit(settings, 'vertical')
    if (!fit) return
    innerHeightPx = fit.innerHeight
    innerWidthPx = fit.width - fit.padLeft - fit.padRight
  } else {
    const dims = PAGE_DIMS[settings.pageSize]
    innerHeightPx = mmToPx(dims.h - settings.marginTop - settings.marginBottom)
    innerWidthPx = mmToPx(dims.w - settings.marginLeft - settings.marginRight)
  }
  if (innerHeightPx <= 0 || innerWidthPx <= 0) return

  // measure 컨테이너 — paper-page 안에 children 임시 배치 → computed style + offsetHeight 측정.
  // 'auto' 인 경우 fit 적용 — measure 컨테이너의 width/height 도 fit 결과로 set.
  const measure = createPaperPage()
  if (fit) applyFitDims(measure, fit)
  for (const child of flat) measure.appendChild(child)
  content.innerHTML = ''
  content.appendChild(measure)

  const lineStream = buildLineStream(
    flat,
    { innerWidthPx, innerHeightPx },
    createPretextMeasurer()
  )
  const lineGroups = splitByLineHeight(lineStream, innerHeightPx)

  // renderLineGroups 가 paper-page 들을 content 에 직접 만든 후 'auto' 면 fit 적용.
  if (fit) {
    const tmp = document.createElement('div')
    renderLineGroups(tmp, lineGroups)
    content.innerHTML = ''
    for (const page of Array.from(tmp.children)) {
      if (page instanceof HTMLElement) applyFitDims(page, fit)
      content.appendChild(page)
    }
  } else {
    renderLineGroups(content, lineGroups)
  }
}

export type StripPagination = {
  totalPages: number
  fit: PageFit
  strip: HTMLElement
}

/**
 * Horizontal / two-pages strip paginate. line 단위 알고리즘은 vertical 과 동일,
 * fit 의 viewport-scaled width/height 사용. renderLineGroups 결과 paper-page 들을
 * .page-strip 으로 wrap + applyFitDims.
 */
export function paginateStrip(
  content: HTMLElement,
  settings: ViewSettings,
  layout: LayoutMode
): StripPagination | null {
  const flat = Array.from(content.children) as HTMLElement[]
  if (flat.length === 0) return null
  const fit = computePageFit(settings, layout)
  if (!fit) return null

  const measure = createPaperPage()
  applyFitDims(measure, fit)
  for (const child of flat) measure.appendChild(child)
  content.innerHTML = ''
  content.appendChild(measure)

  const innerWidthPx = fit.width - fit.padLeft - fit.padRight
  const lineStream = buildLineStream(
    flat,
    { innerWidthPx, innerHeightPx: fit.innerHeight },
    createPretextMeasurer()
  )
  const lineGroups = splitByLineHeight(lineStream, fit.innerHeight)

  // renderLineGroups 가 paper-page 들을 임시 컨테이너에 만든 후 strip 으로 wrap
  const tmp = document.createElement('div')
  renderLineGroups(tmp, lineGroups)

  content.innerHTML = ''
  const strip = document.createElement('div')
  strip.className = 'page-strip'
  for (const page of Array.from(tmp.children)) {
    if (page instanceof HTMLElement) applyFitDims(page, fit)
    strip.appendChild(page)
  }
  content.appendChild(strip)
  return { totalPages: lineGroups.length, fit, strip }
}
