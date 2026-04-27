/**
 * Line-단위 paginate 의 1차 단위. element 단위 splitByHeight 를 대체.
 *
 * 책임 분리 (export):
 *  - Line, LineKind type
 *  - SHORT_PARAGRAPH_RATIO 상수
 *  - isInlineSplittable / isHeading / isUnitElement / isListContainer (tag 분류)
 *  - buildLineStream — element[] → Line[]
 *  - splitByLineHeight — Line[] → Line[][] (heading orphan 포함)
 *  - groupLinesBySource — page group 안의 line 들을 source 별로 묶기
 *  - renderLineGroups — Line[][] → DOM 재구성 (paper-page 생성)
 */

import {
  type FontStyle,
  type LineRangeMeasurer,
  splitElementAtCharIndex
} from './paragraphSplit'

export type LineKind = 'paragraph' | 'heading' | 'unit' | 'list-item'

export type Line = {
  source: HTMLElement
  charStart: number   // -1 = 전체 element
  charEnd: number     // exclusive (-1 = 전체 element)
  height: number      // line-height 또는 element offsetHeight
  splittable: boolean // 같은 source 의 다른 line 들과 합쳐서 한 element 로 다시 묶을 수 있는지
  breakAfterAvoid: boolean  // 다음 line 과 분리 금지 (heading orphan 방지)
  kind: LineKind
}

export type LineStreamMetrics = {
  innerWidthPx: number
  innerHeightPx: number
}

/** offsetHeight ≤ lineHeight × SHORT_PARAGRAPH_RATIO 면 measure 호출 skip. */
export const SHORT_PARAGRAPH_RATIO = 1.5

/** inline-splittable: 안에 텍스트만 있고 line 단위 분할 가능 */
const INLINE_SPLITTABLE_TAGS: ReadonlySet<string> = new Set(['p', 'li'])

/** unit: 분할 불가 단위. heading 포함 안 함 (heading 은 별도 처리) */
const UNIT_TAGS: ReadonlySet<string> = new Set([
  'pre',
  'table',
  'img',
  'blockquote',
  'hr',
  'figure',
  'svg'
])

const HEADING_TAGS: ReadonlySet<string> = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6'
])

const LIST_CONTAINER_TAGS: ReadonlySet<string> = new Set(['ul', 'ol'])

export function isInlineSplittable(el: HTMLElement): boolean {
  return INLINE_SPLITTABLE_TAGS.has(el.tagName.toLowerCase())
}

export function isHeading(el: HTMLElement): boolean {
  return HEADING_TAGS.has(el.tagName.toLowerCase())
}

export function isUnitElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase()
  if (UNIT_TAGS.has(tag)) return true
  if (tag === 'div' && el.classList.contains('callout')) return true
  return false
}

export function isListContainer(el: HTMLElement): boolean {
  return LIST_CONTAINER_TAGS.has(el.tagName.toLowerCase())
}

/** element 의 computed style → FontStyle. */
function readFontStyle(el: HTMLElement): FontStyle {
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el)
  const fontSize = parseFloat(cs.fontSize) || 16
  return {
    fontFamily: cs.fontFamily,
    fontSize,
    fontWeight: cs.fontWeight,
    fontStyle: cs.fontStyle,
    lineHeight: parseFloat(cs.lineHeight) || fontSize * 1.5,
    letterSpacing: parseFloat(cs.letterSpacing) || 0,
    whiteSpace: cs.whiteSpace,
    wordBreak: cs.wordBreak
  }
}

/** measurer / splitElementAtCharIndex export 는 lineStream 내부 import 만 — 외부 재export 안 함. */
export { splitElementAtCharIndex }
export type { FontStyle, LineRangeMeasurer }

// readFontStyle 은 internal — 단위 테스트 용 _readFontStyle export 안 함 (computed style 의존, mock 가능)
