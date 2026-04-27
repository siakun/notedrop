/**
 * pretext 어댑터 + DOM Range 기반 element split helper. lineStream.ts 가 재사용.
 *
 * 책임 분리 (export):
 *  - FontStyle / LineRange / MeasureResult / LineRangeMeasurer (type)
 *  - splitElementAtCharIndex — DOM Range 기반 element split (pretext 무관)
 *  - mapLineTextsToRanges — 줄별 lineText → 원본 char range
 *  - createPretextMeasurer — pretext 어댑터 (boundary 단일 import 지점)
 *
 * 옛 element-단위 함수 (splitParagraph, expandLargeParagraphs, isSplittableElement,
 * pickSplitLine, readFontStyle, ParagraphDiag) 는 v0.1.52 에서 폐기 — line-단위
 * paginate (lib/lineStream.ts) 가 superset 로 대체.
 */

import {
  materializeLineRange,
  prepareWithSegments,
  walkLineRanges,
  type WordBreakMode
} from '@chenglou/pretext'

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

/** pretext 호출의 추상화. 단위 테스트에서 fake measurer 주입. */
export type LineRangeMeasurer = (
  text: string,
  style: FontStyle,
  widthPx: number
) => MeasureResult

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
