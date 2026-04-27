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
