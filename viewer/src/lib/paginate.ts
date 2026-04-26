import type { LayoutMode, ViewSettings } from '@/types/viewSettings'
import { PAGE_DIMS } from '@/types/viewSettings'

export function mmToPx(mm: number): number {
  return mm * (96 / 25.4)
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function splitByHeight(heights: number[], limit: number): number[][] {
  const groups: number[][] = [[]]
  let used = 0
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i]!
    const last = groups[groups.length - 1]!
    if (used + h > limit && last.length > 0) {
      groups.push([])
      used = 0
    }
    groups[groups.length - 1]!.push(i)
    used += h
  }
  return groups
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

  let pageHeight = viewportH - 32
  let pageWidth = pageHeight * ratio

  if (layout === 'two-pages') {
    const widthBudget = (viewportW - gap - horizPaddingExtra * 2) / 2
    if (widthBudget < pageWidth) {
      pageWidth = widthBudget
      pageHeight = pageWidth / ratio
    }
  } else {
    const widthBudget = viewportW - horizPaddingExtra * 2
    if (widthBudget < pageWidth) {
      pageWidth = widthBudget
      pageHeight = pageWidth / ratio
    }
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

export function paginateVertical(
  content: HTMLElement,
  settings: ViewSettings
): void {
  const dims = PAGE_DIMS[settings.pageSize]
  const innerHeightPx = mmToPx(
    dims.h - settings.marginTop - settings.marginBottom
  )
  if (innerHeightPx <= 0) return

  const flat = Array.from(content.children) as HTMLElement[]
  if (flat.length === 0) return

  const initialPage = createPaperPage()
  for (const child of flat) initialPage.appendChild(child)
  content.innerHTML = ''
  content.appendChild(initialPage)

  const heights = flat.map((c) => c.offsetHeight)
  const groups = splitByHeight(heights, innerHeightPx)

  content.innerHTML = ''
  for (const group of groups) {
    const page = createPaperPage()
    for (const idx of group) page.appendChild(flat[idx]!)
    content.appendChild(page)
  }
}

export type StripPagination = {
  totalPages: number
  fit: PageFit
  strip: HTMLElement
}

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
  const heights = flat.map((c) => c.offsetHeight)
  const groups = splitByHeight(heights, fit.innerHeight)

  content.innerHTML = ''
  const strip = document.createElement('div')
  strip.className = 'page-strip'
  for (const group of groups) {
    const page = createPaperPage()
    applyFitDims(page, fit)
    for (const idx of group) page.appendChild(flat[idx]!)
    strip.appendChild(page)
  }
  content.appendChild(strip)
  return { totalPages: groups.length, fit, strip }
}
