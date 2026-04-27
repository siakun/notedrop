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

/**
 * element[] → Line[]. element 종류별 분류 + line 발생.
 *
 * - paragraph (<p>): measurer 호출 → N line. 짧은 단락 (offsetHeight ≤
 *   lineHeight × SHORT_PARAGRAPH_RATIO) 은 measure skip → 1 line.
 * - heading: 1 line + breakAfterAvoid: true.
 * - unit (table/pre/img/blockquote/callout/hr/figure/svg): 1 line.
 * - list (ul/ol): 자식 li 재귀.
 * - 빈 element: 1 line.
 *
 * measurer throw 시 element 단위 1 line fallback (canvas 부재 환경 호환).
 */
export function buildLineStream(
  children: HTMLElement[],
  metrics: LineStreamMetrics,
  measurer: LineRangeMeasurer
): Line[] {
  const out: Line[] = []
  for (const child of children) {
    if (isListContainer(child)) {
      const liChildren = Array.from(child.children) as HTMLElement[]
      out.push(...buildLineStream(liChildren, metrics, measurer))
      continue
    }
    if (isHeading(child)) {
      out.push({
        source: child,
        charStart: -1,
        charEnd: -1,
        height: child.offsetHeight,
        splittable: false,
        breakAfterAvoid: true,
        kind: 'heading'
      })
      continue
    }
    if (isUnitElement(child)) {
      out.push({
        source: child,
        charStart: -1,
        charEnd: -1,
        height: child.offsetHeight,
        splittable: false,
        breakAfterAvoid: false,
        kind: 'unit'
      })
      continue
    }
    if (isInlineSplittable(child)) {
      const text = child.textContent ?? ''
      const isLi = child.tagName.toLowerCase() === 'li'
      const baseKind: LineKind = isLi ? 'list-item' : 'paragraph'
      if (text.length === 0) {
        out.push({
          source: child,
          charStart: -1,
          charEnd: -1,
          height: child.offsetHeight,
          splittable: false,
          breakAfterAvoid: false,
          kind: baseKind
        })
        continue
      }
      const style = readFontStyle(child)
      // 짧은 단락 — measure skip
      if (child.offsetHeight <= style.lineHeight * SHORT_PARAGRAPH_RATIO) {
        out.push({
          source: child,
          charStart: -1,
          charEnd: -1,
          height: child.offsetHeight,
          splittable: false,
          breakAfterAvoid: false,
          kind: baseKind
        })
        continue
      }
      let measured: { lineHeight: number; lines: { startIdx: number; endIdx: number }[] }
      try {
        measured = measurer(text, style, metrics.innerWidthPx)
      } catch {
        out.push({
          source: child,
          charStart: -1,
          charEnd: -1,
          height: child.offsetHeight,
          splittable: false,
          breakAfterAvoid: false,
          kind: baseKind
        })
        continue
      }
      for (const lr of measured.lines) {
        out.push({
          source: child,
          charStart: lr.startIdx,
          charEnd: lr.endIdx,
          height: measured.lineHeight,
          splittable: true,
          breakAfterAvoid: false,
          kind: baseKind
        })
      }
      continue
    }
    // 알 수 없는 element — unit 으로 취급 (분할 X)
    out.push({
      source: child,
      charStart: -1,
      charEnd: -1,
      height: child.offsetHeight,
      splittable: false,
      breakAfterAvoid: false,
      kind: 'unit'
    })
  }
  return out
}

/**
 * Line[] → page groups. heading orphan 방지 규칙 포함.
 *
 * heading orphan: heading line 이 group 의 *마지막* 위치이고 다음 line 이
 * 같은 group 에 못 들어가면 → heading 도 다음 group 으로 이동 (의미 단위
 * 보존). 단 heading 이 *전체 line 의 마지막* 이거나 group 의 유일 line 이면
 * 그대로 (빈 group 만들기 더 나쁨).
 */
export function splitByLineHeight(
  lines: Line[],
  innerHeightPx: number
): Line[][] {
  const groups: Line[][] = [[]]
  let used = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    let last = groups[groups.length - 1]!

    if (used + line.height > innerHeightPx && last.length > 0) {
      groups.push([])
      used = 0
      last = groups[groups.length - 1]!
    }
    last.push(line)
    used += line.height

    // heading orphan 방지: line 이 push 된 직후 검사
    if (
      line.breakAfterAvoid &&
      i < lines.length - 1 && // 전체 마지막 line 이 아님
      last.length > 1 // heading 이 group 의 유일 line 이면 옮길 데 없음 — skip
    ) {
      const next = lines[i + 1]!
      // 두 조건 모두 충족할 때만 orphan 방지 작동:
      //   (1) 현재 group 에 next 가 더 못 들어감 (heading 이 mid-group orphan)
      //   (2) heading + next 가 새 group 에 들어갈 수 있음 (이동해도 limit 안)
      // 둘 중 하나라도 안 맞으면 그대로 — limit 초과 강제 묶음 회피.
      if (
        used + next.height > innerHeightPx &&
        line.height + next.height <= innerHeightPx
      ) {
        last.pop()
        groups.push([line])
        used = line.height
      }
    }
  }

  return groups
}

export type SourceGroup = {
  source: HTMLElement
  lines: Line[]
}

/** 연속 same source 의 line 들을 SourceGroup 으로 묶음 (순수 함수). */
export function groupLinesBySource(lines: Line[]): SourceGroup[] {
  const out: SourceGroup[] = []
  for (const line of lines) {
    const last = out[out.length - 1]
    if (last && last.source === line.source) {
      last.lines.push(line)
    } else {
      out.push({ source: line.source, lines: [line] })
    }
  }
  return out
}

// renderLineGroups + extractCharRange + renderSourceGroup + createPaperPage 함수
// 들이 v0.1.59 에서 폐기됨 (PaperPage React 컴포넌트가 대체).
// readFontStyle 은 internal — 단위 테스트 X (computed style 의존, mock 가능)
