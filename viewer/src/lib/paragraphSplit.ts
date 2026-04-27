/**
 * 단락 1개가 페이지 inner height 를 초과할 때 줄 단위로 분할.
 * pretext (canvas 기반 폰트 메트릭) 측정 결과를 받아 DOM Range 로 split.
 *
 * 책임 분리 (export 단위):
 *  - isSplittableElement   — tag 기반 splittable 판단
 *  - pickSplitLine         — pretext 결과에서 페이지에 들어가는 마지막 줄 선택
 *  - splitElementAtCharIndex — DOM Range 기반 element split (pretext 무관)
 *  - mapLineTextsToRanges  — 줄별 lineText → 원본 char range
 *  - createPretextMeasurer — pretext 어댑터 (boundary 단일 import 지점)
 *  - splitParagraph        — 위 함수들을 결합한 한 단락 분할 + 재귀
 *  - expandLargeParagraphs — 다수 children 에 대해 splitParagraph 적용 + DOM swap
 *
 * 모든 임계값은 named const. measurer 는 DI — production 은 createPretextMeasurer,
 * 단위 테스트는 fake.
 */

import {
  materializeLineRange,
  prepareWithSegments,
  walkLineRanges,
  type WordBreakMode
} from '@chenglou/pretext'
import { logger } from './logger'

/** pretext 의 WhiteSpaceMode (analysis.d.ts) — layout entry 에서 re-export 안 됨 */
type PretextWhiteSpace = 'normal' | 'pre-wrap'

export type FontStyle = {
  fontFamily: string
  fontSize: number  // px
  fontWeight: string
  fontStyle: string
  lineHeight: number  // px
  letterSpacing: number  // px
  whiteSpace: string
  wordBreak: string
}

export type LineRange = {
  startIdx: number
  endIdx: number  // exclusive
}

export type MeasureResult = {
  lineHeight: number  // px (실 line-height)
  lines: LineRange[]
}

/**
 * pretext 호출의 추상화. 단위 테스트에서 fake measurer 주입.
 */
export type LineRangeMeasurer = (
  text: string,
  style: FontStyle,
  widthPx: number
) => MeasureResult

export type SplitMetrics = {
  innerWidthPx: number
  innerHeightPx: number
}

/** splittable 한 tagName 들. lower-case 비교. */
export const SPLITTABLE_TAGS: ReadonlySet<string> = new Set(['p', 'li'])

/** splitParagraph 재귀 최대 depth — 무한 루프 가드. */
export const MAX_SPLIT_RECURSION = 50

/** 단락이 height 게이트를 통과하는 여유 (overflow:hidden 의 마진). */
export const SPLIT_HEIGHT_TOLERANCE_PX = 1

/**
 * tag 가 splittable 한지 — `<p>`, `<li>` 만 true. heading / table / pre / code /
 * img / list-container / blockquote / div 등은 false (의미 단위 보존).
 */
export function isSplittableElement(el: HTMLElement): boolean {
  return SPLITTABLE_TAGS.has(el.tagName.toLowerCase())
}

/**
 * pretext measure 결과 + 페이지 inner height 로 split 지점의 char index 산출.
 *
 * @returns char index — 이 위치를 boundary 로 잡고 element 를 split.
 *   null → 분할 불필요 (전체가 들어가거나 입력 비정상).
 */
export function pickSplitLine(
  result: MeasureResult,
  innerHeightPx: number
): number | null {
  const { lineHeight, lines } = result
  if (lines.length === 0) return null
  if (lineHeight <= 0) return null

  const totalHeight = lineHeight * lines.length
  if (totalHeight <= innerHeightPx + SPLIT_HEIGHT_TOLERANCE_PX) return null

  const fitCount = Math.floor(innerHeightPx / lineHeight)
  // 한 줄도 안 들어가는 극한 케이스에도 최소 1줄 강제 — 무한 재귀 회피.
  const safeCount = Math.max(1, fitCount)
  const idx = Math.min(safeCount, lines.length) - 1
  return lines[idx]!.endIdx
}

/**
 * el 안의 textNode 들을 in-order 순회하며 누적 char count 가 target 에 도달한
 * (textNode, offset) 을 반환.
 */
function locateCharBoundary(
  el: HTMLElement,
  target: number
): { node: Text; offset: number } | null {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let acc = 0
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.data.length
    if (acc + len >= target) {
      return { node, offset: target - acc }
    }
    acc += len
    node = walker.nextNode() as Text | null
  }
  return null
}

/**
 * element 안의 char count 가 charIndex 인 위치를 boundary 로 element 를 split.
 *
 * pretext / measure 와 무관한 순수 DOM 함수. textNode 누적 char count 로 boundary
 * 를 찾고 Range.extractContents 로 후반부를 분리. 후반부를 담은 동일 tag 의 신규
 * element 를 반환 — id 는 제거, 그 외 attribute 는 복제.
 *
 * @returns 후반부 element. split 불가능하면 null (원본 변경 없음).
 */
export function splitElementAtCharIndex(
  el: HTMLElement,
  charIndex: number
): HTMLElement | null {
  if (charIndex <= 0) return null
  const totalLength = (el.textContent ?? '').length
  if (charIndex >= totalLength) return null
  if (!el.lastChild) return null

  const boundary = locateCharBoundary(el, charIndex)
  if (!boundary) return null

  const range = el.ownerDocument.createRange()
  range.setStart(boundary.node, boundary.offset)
  range.setEndAfter(el.lastChild)
  const fragment = range.extractContents()

  const tail = el.ownerDocument.createElement(el.tagName) as HTMLElement
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'id') continue
    tail.setAttribute(attr.name, attr.value)
  }
  tail.appendChild(fragment)
  return tail
}

/**
 * 줄별 lineText 배열을 원본 text 안의 char range 배열로 매핑. pretext 가 정규화한
 * lineText (multi-space → single-space 등) 가 indexOf 로 못 찾히면 positional 추정
 * (pos + lineText.length 누적) 로 fallback — 화면 깨짐보다 약간 부정확한 split
 * boundary 가 낫다.
 */
export function mapLineTextsToRanges(text: string, lineTexts: string[]): LineRange[] {
  const lines: LineRange[] = []
  let pos = 0
  for (const lt of lineTexts) {
    if (lt.length === 0) continue
    const startIdx = text.indexOf(lt, pos)
    if (startIdx < 0) {
      const endIdx = Math.min(pos + lt.length, text.length)
      lines.push({ startIdx: pos, endIdx })
      pos = endIdx
      continue
    }
    const endIdx = startIdx + lt.length
    lines.push({ startIdx, endIdx })
    pos = endIdx
  }
  return lines
}

/** FontStyle → CSS font shorthand. pretext 가 받는 형식. */
function buildFontShorthand(style: FontStyle): string {
  const sizePart = `${style.fontSize}px`
  const familyPart = style.fontFamily || 'sans-serif'
  const parts: string[] = []
  if (style.fontStyle && style.fontStyle !== 'normal') parts.push(style.fontStyle)
  if (style.fontWeight && style.fontWeight !== 'normal' && style.fontWeight !== '400') {
    parts.push(style.fontWeight)
  }
  parts.push(sizePart)
  parts.push(familyPart)
  return parts.join(' ')
}

/** CSS white-space → pretext WhiteSpaceMode (지원 외 값은 normal) */
function toPretextWhiteSpace(ws: string): PretextWhiteSpace {
  return ws === 'pre-wrap' ? 'pre-wrap' : 'normal'
}

/** CSS word-break → pretext WordBreakMode (지원 외 값은 normal) */
function toPretextWordBreak(wb: string): WordBreakMode {
  return wb === 'keep-all' ? 'keep-all' : 'normal'
}

/**
 * element 의 computed style 에서 pretext 입력용 FontStyle 추출. DOM 의존이라
 * 단위 테스트에서 직접 호출 안 함 — splitParagraph 의 통합 단계에서만 사용.
 */
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

/**
 * 단일 element 분할. splittable 아니거나 fits 면 [el] 반환. 초과 시 재귀로 다수
 * element 반환. measurer 실패 시 [el] fallback. 재귀 depth 제한 (MAX_SPLIT_RECURSION)
 * 으로 무한 루프 가드.
 *
 * @param measurer DI — 단위 테스트에서 fake 주입. production 은 createPretextMeasurer().
 */
export function splitParagraph(
  el: HTMLElement,
  metrics: SplitMetrics,
  measurer: LineRangeMeasurer
): HTMLElement[] {
  if (!isSplittableElement(el)) return [el]
  return splitParagraphRec(el, metrics, measurer, 0)
}

function splitParagraphRec(
  el: HTMLElement,
  metrics: SplitMetrics,
  measurer: LineRangeMeasurer,
  depth: number
): HTMLElement[] {
  if (depth >= MAX_SPLIT_RECURSION) return [el]

  const text = el.textContent ?? ''
  if (text.length === 0) return [el]

  let measured: MeasureResult
  try {
    measured = measurer(text, readFontStyle(el), metrics.innerWidthPx)
  } catch {
    return [el]
  }

  const splitAt = pickSplitLine(measured, metrics.innerHeightPx)
  if (splitAt === null) return [el]

  const tail = splitElementAtCharIndex(el, splitAt)
  if (!tail) return [el]

  return [el, ...splitParagraphRec(tail, metrics, measurer, depth + 1)]
}

/**
 * pretext 호출의 단일 진입점. 다른 함수는 LineRangeMeasurer 인터페이스만 사용
 * — 이 어댑터를 fake 로 교체 가능. canvas 부재 환경 (jsdom) 에서 실행 시
 * 호출자가 try/catch 로 fallback.
 */
export function createPretextMeasurer(): LineRangeMeasurer {
  return (text, style, widthPx) => {
    const font = buildFontShorthand(style)
    const prepared = prepareWithSegments(text, font, {
      whiteSpace: toPretextWhiteSpace(style.whiteSpace),
      wordBreak: toPretextWordBreak(style.wordBreak),
      letterSpacing: style.letterSpacing
    })
    const lineTexts: string[] = []
    walkLineRanges(prepared, widthPx, (line) => {
      lineTexts.push(materializeLineRange(prepared, line).text)
    })
    const lines = mapLineTextsToRanges(text, lineTexts)
    return { lineHeight: style.lineHeight, lines }
  }
}

/** 진단 카운터 — window.__notedropParagraphDiag 에 노출. */
type ParagraphDiag = {
  callCount: number
  splittableSeen: number
  measurerErrors: number
  splitParagraphs: number
  partsCreated: number
  oversizedRemaining: number
  lastError: string | null
  innerWidthPx: number
  innerHeightPx: number
}

declare global {
  interface Window {
    __notedropParagraphDiag?: ParagraphDiag
  }
}

function emptyDiag(): ParagraphDiag {
  return {
    callCount: 0,
    splittableSeen: 0,
    measurerErrors: 0,
    splitParagraphs: 0,
    partsCreated: 0,
    oversizedRemaining: 0,
    lastError: null,
    innerWidthPx: 0,
    innerHeightPx: 0
  }
}

/**
 * 다수 children 에 대해 splitParagraph 적용. 분할된 경우 parent DOM 에 in-place
 * swap (원본 위치에 분할 결과를 순서대로 삽입, 원본 제거).
 *
 * 호출 시점에 children 은 이미 measure 컨테이너 안에 있어야 한다 — splitParagraph
 * 의 readFontStyle 가 computed style 을 의미 있는 값으로 반환하기 위함.
 *
 * 진단: window.__notedropParagraphDiag 에 호출 횟수 / 분할 / measurer 에러
 * / oversized remaining 누적. dev console 에서 검증 가능.
 *
 * @returns 평탄화된 element 배열 (DOM 순서와 동일).
 */
export function expandLargeParagraphs(
  parent: HTMLElement,
  children: HTMLElement[],
  metrics: SplitMetrics,
  measurer: LineRangeMeasurer
): HTMLElement[] {
  const diag: ParagraphDiag =
    typeof window !== 'undefined' && window.__notedropParagraphDiag
      ? window.__notedropParagraphDiag
      : emptyDiag()
  diag.callCount++
  diag.innerWidthPx = metrics.innerWidthPx
  diag.innerHeightPx = metrics.innerHeightPx

  const wrappedMeasurer: LineRangeMeasurer = (text, style, widthPx) => {
    try {
      return measurer(text, style, widthPx)
    } catch (err) {
      diag.measurerErrors++
      diag.lastError = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  const output: HTMLElement[] = []
  for (const child of children) {
    if (isSplittableElement(child)) diag.splittableSeen++
    const parts = splitParagraph(child, metrics, wrappedMeasurer)
    if (parts.length === 1 && parts[0] === child) {
      output.push(child)
      continue
    }
    diag.splitParagraphs++
    diag.partsCreated += parts.length - 1

    // splitParagraph 는 [child, tail1, tail2, ...] 반환 — child 는 in-place 변형
    // 된 head. 따라서 child 는 그대로 두고 후속 parts 만 child 다음에 삽입.
    let prev: Node = child
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]!
      parent.insertBefore(part, prev.nextSibling)
      prev = part
    }
    output.push(...parts)
  }

  // oversized 검사 — 분할 후에도 inner height 초과인 element 카운트
  const limit = metrics.innerHeightPx + SPLIT_HEIGHT_TOLERANCE_PX
  diag.oversizedRemaining = output.filter((el) => el.offsetHeight > limit).length

  if (typeof window !== 'undefined') {
    window.__notedropParagraphDiag = diag
  }

  if (diag.measurerErrors > 0 || diag.oversizedRemaining > 0) {
    logger.warn('paginate', '단락 분할 비정상', {
      measurerErrors: diag.measurerErrors,
      oversizedRemaining: diag.oversizedRemaining,
      splittableSeen: diag.splittableSeen,
      splitParagraphs: diag.splitParagraphs,
      lastError: diag.lastError
    })
  } else {
    logger.debug('paginate', '단락 분할 정상', {
      childCount: children.length,
      outputCount: output.length,
      splittableSeen: diag.splittableSeen,
      splitParagraphs: diag.splitParagraphs,
      partsCreated: diag.partsCreated
    })
  }

  return output
}
