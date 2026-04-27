'use client'

import { useLayoutEffect, useRef } from 'react'
import { applyFitDims, type PageFit } from '@/lib/paginate'
import {
  splitElementAtCharIndex,
  type SourceGroup
} from '@/lib/lineStream'

type PaperPageProps = {
  sourceGroups: SourceGroup[]
  fit: PageFit | null
}

/**
 * 한 페이지 element. Zustand pages state 의 PageData 1개 → DOM. source group 의
 * source element 를 cloneNode (또는 split 케이스 시 extractCharRange) 로 추출 후
 * paper-page 안 mount.
 *
 * useLayoutEffect 안 imperative 진입 — sourceGroups reference 가 같으면 skip.
 * fit 이 있으면 inline style 로 width/height/padding 적용 (horizontal/two-pages
 * 또는 vertical Auto).
 */
export default function PaperPage({ sourceGroups, fit }: PaperPageProps) {
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = ''
    for (const sg of sourceGroups) {
      const partEl = renderSourceGroup(sg)
      el.appendChild(partEl)
    }
    // list-item 들을 부모 <ul>/<ol> 으로 wrap (renderSourceGroup 가 li 만 반환)
    rewrapListItems(el)
  }, [sourceGroups])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !fit) return
    applyFitDims(el, fit)
  }, [fit])

  return <section ref={ref} className="paper-page" />
}

/** SourceGroup → element. splittable 면 charRange 추출, 아니면 source clone. */
function renderSourceGroup(sg: SourceGroup): HTMLElement {
  const { source, lines } = sg
  const first = lines[0]!
  const last = lines[lines.length - 1]!
  if (!first.splittable || first.charStart < 0) {
    return source.cloneNode(true) as HTMLElement
  }
  return extractCharRange(source, first.charStart, last.charEnd)
}

function extractCharRange(
  source: HTMLElement,
  startChar: number,
  endChar: number
): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement
  const totalLen = (clone.textContent ?? '').length
  if (endChar < totalLen && endChar > 0) {
    splitElementAtCharIndex(clone, endChar)
  }
  if (startChar > 0) {
    const tail = splitElementAtCharIndex(clone, startChar)
    if (tail) return tail
  }
  return clone
}

/**
 * <li> 들을 새 <ul>/<ol> 으로 wrap. PaperPage mount 시 li 가 직접 paper-page 의
 * 자식으로 들어간 경우, 의미 단위 보존을 위해 list 컨테이너로 묶음. attribute 복제.
 */
function rewrapListItems(page: HTMLElement): void {
  const doc = page.ownerDocument
  let cursor: Element | null = page.firstElementChild
  while (cursor) {
    const next = cursor.nextElementSibling
    if (cursor.tagName === 'LI') {
      const liEl = cursor as HTMLElement
      const originalListTag =
        liEl.parentElement?.tagName.toLowerCase() === 'ol' ? 'ol' : 'ul'
      const listEl = doc.createElement(originalListTag)
      // 같은 group 의 연속 <li> 들 모음
      let collect: Element | null = cursor
      while (collect && collect.tagName === 'LI') {
        const nx: Element | null = collect.nextElementSibling
        listEl.appendChild(collect)
        collect = nx
      }
      page.insertBefore(listEl, next)
    }
    cursor = next
  }
}
