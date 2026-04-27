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
 * 한 페이지 element. Zustand pages state 의 PageData 1개 → DOM. SourceGroup 의
 * source 를 cloneNode (또는 split 케이스 시 extractCharRange) 로 추출 후 paper-page
 * 안 mount. list-item 들은 부모 <ul>/<ol> 으로 wrap (의미 단위 보존).
 *
 * useLayoutEffect — sourceGroups reference 가 같으면 React reconciliation 으로 skip.
 * fit 있으면 inline style 로 width/height/padding 적용 (horizontal/two-pages /
 * vertical Auto).
 */
export default function PaperPage({ sourceGroups, fit }: PaperPageProps) {
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const doc = el.ownerDocument
    el.innerHTML = ''

    let pendingList: HTMLElement | null = null
    for (const sg of sourceGroups) {
      const partEl = renderSourceGroup(sg)
      const isListItem = sg.lines[0]!.kind === 'list-item'

      if (isListItem) {
        const originalListTag =
          sg.source.parentElement?.tagName.toLowerCase() === 'ol' ? 'ol' : 'ul'
        if (
          !pendingList ||
          pendingList.tagName.toLowerCase() !== originalListTag
        ) {
          pendingList = doc.createElement(originalListTag)
          if (sg.source.parentElement) {
            for (const attr of Array.from(sg.source.parentElement.attributes)) {
              if (attr.name === 'id') continue
              pendingList.setAttribute(attr.name, attr.value)
            }
          }
          el.appendChild(pendingList)
        }
        pendingList.appendChild(partEl)
      } else {
        pendingList = null
        el.appendChild(partEl)
      }
    }
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
