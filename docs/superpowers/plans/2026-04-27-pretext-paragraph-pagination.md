# pretext 기반 단락 내부 분할 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** viewer 의 paper-page 가 긴 단락 1개를 페이지 안에서 줄 단위로 자르지 못해 잘려 보이는 문제를 `@chenglou/pretext` 로 단락의 줄별 char range 를 측정하고 DOM Range 로 다중 단락으로 split 하는 사전 분할 단계를 추가하여 해결한다.

**Architecture:** 신규 파일 `viewer/src/lib/paragraphSplit.ts` 가 splittable 판단 / 줄 선택 / DOM split / pretext 어댑터를 책임 단위로 분리해서 export. `paginate.ts` 의 `splitByHeight` 는 변경하지 않고 그 *상위*에 `expandLargeParagraphs` 사전 분할 단계를 추가. `paginateVertical` 과 `paginateStrip` 두 진입점이 동일 helper 사용.

**Tech Stack:** TypeScript / Next.js / vitest + jsdom / `@chenglou/pretext` v0.0.6 / 기존 lib 의 paginate 함수 재사용.

**원칙 (사용자 요구):**
- 매직 넘버 / 매직 문자열 금지 — 모든 임계값은 named const
- DI (measurer 주입) — `paragraphSplit` 가 `@chenglou/pretext` 를 직접 import 하지 않고 어댑터 함수만 createPretextMeasurer 안에 격리
- 단일 책임 함수 — 한 export 한 결정
- early return + happy path 직선
- 측정 실패 시 fallback (원본 그대로 반환) — boundary 에서만 try/catch
- TDD — 순수 함수 4 개 (`isSplittableElement`, `pickSplitLine`, `splitElementAtCharIndex`, `splitParagraph`) 모두 단위 테스트 우선
- 각 Task 단위 commit

**관련 spec:** `docs/superpowers/specs/2026-04-27-pretext-paragraph-pagination-design.md`

---

## File Structure

| 파일 | 책임 | 동작 |
|---|---|---|
| `viewer/package.json` | 의존성 추가 | Modify |
| `viewer/src/lib/paragraphSplit.ts` | 신규 모듈. 모든 분할 로직 | Create |
| `viewer/src/lib/paragraphSplit.test.ts` | 신규 단위 테스트 | Create |
| `viewer/src/lib/paginate.ts` | `paginateVertical` + `paginateStrip` 두 곳에 expandLargeParagraphs 호출 추가 | Modify |
| `viewer/src/lib/paginate.test.ts` | expandLargeParagraphs 통합 검증 추가 | Modify |
| `docs/superpowers/handoffs/2026-04-27-pretext-pagination-completion.md` | 작업 완료 핸드오프 | Create |

---

## Task 1: `@chenglou/pretext` 의존성 추가 + 실 API 검증 + 번들 baseline

**Files:**
- Modify: `viewer/package.json`
- Create (임시): 콘솔에 실 API 출력 → 본 plan §Task 6 / §Task 7 갱신
- Output: 번들 size baseline 기록 (이 task 의 commit 메시지에 포함)

- [ ] **Step 1: viewer 빌드 baseline 측정**

```bash
cd viewer && npm run build 2>&1 | tail -40
```

`.next/static/chunks/` 의 main bundle size 를 기록 (KB).

- [ ] **Step 2: `@chenglou/pretext` 설치**

```bash
cd viewer && npm install @chenglou/pretext@^0.0.6
```

설치 후 `viewer/package.json` 의 `dependencies` 블록에 `"@chenglou/pretext": "^0.0.6"` 추가 확인.

- [ ] **Step 3: 실 API 검증 — d.ts 읽기**

```bash
cat viewer/node_modules/@chenglou/pretext/package.json | grep -E '"main"|"types"|"exports"'
ls viewer/node_modules/@chenglou/pretext/dist/ 2>&1 | head
```

핵심 export 와 타입 시그니처를 읽어서 다음을 확정한다 (spec 의 가정과 실 API 이름이 다를 가능성):
- 측정 진입 함수 (가정: `prepareWithSegments(text, options)`)
- 줄별 range 산출 함수 (가정: `walkLineRanges(prepared)`)
- 옵션 타입 (font, line-height, width 필드명)

확정된 함수명/시그니처를 **본 plan 의 Task 6 / Task 7 의 코드 블록에 그대로 반영** 한다 (다음 task 시작 전에 plan 자체를 갱신).

- [ ] **Step 4: 번들 size diff 측정**

```bash
cd viewer && npm run build 2>&1 | tail -40
```

baseline 대비 main chunk 의 size 증가량을 기록. 200 KB (gzipped 기준) 초과면 본 plan §결정사항 ① 재확인 → 사용자에게 보고 후 진행.

- [ ] **Step 5: typecheck**

```bash
cd viewer && npm run typecheck
```

Expected: 신규 import 없으므로 변동 없이 통과.

- [ ] **Step 6: Commit**

```bash
git add viewer/package.json viewer/package-lock.json docs/superpowers/plans/2026-04-27-pretext-paragraph-pagination.md
git commit -m "$(cat <<'EOF'
✨ feat(viewer): add @chenglou/pretext dependency for paragraph splitting

번들 baseline: <baseline KB> → <new KB> (+<diff KB>)
실 API 확정: prepareWithSegments / walkLineRanges (또는 실제 이름)
spec: docs/superpowers/specs/2026-04-27-pretext-paragraph-pagination-design.md
EOF
)"
```

---

## Task 2: 타입 + 상수 정의

**Files:**
- Create: `viewer/src/lib/paragraphSplit.ts`

- [ ] **Step 1: paragraphSplit.ts 의 상단 타입 + 상수 작성**

`viewer/src/lib/paragraphSplit.ts`:

```ts
/**
 * 단락 1개가 페이지 inner height 를 초과할 때 줄 단위로 분할.
 * pretext (canvas 기반 폰트 메트릭) 측정 결과를 받아 DOM Range 로 split.
 *
 * 책임 분리:
 *  - isSplittableElement — tag 기반 splittable 판단
 *  - pickSplitLine — pretext 결과에서 페이지에 들어가는 마지막 줄 선택
 *  - splitElementAtCharIndex — DOM Range 기반 element split (pretext 무관)
 *  - createPretextMeasurer — pretext 어댑터 (boundary)
 *  - splitParagraph — 위 함수들을 결합한 한 단락 분할
 *  - expandLargeParagraphs — 다수 children 에 대해 splitParagraph 적용 + DOM swap
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
  lineHeight: number  // px (실 line-height — pretext 가 옵션과 다른 값을 쓸 수 있음)
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
```

- [ ] **Step 2: typecheck 통과 확인**

```bash
cd viewer && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add viewer/src/lib/paragraphSplit.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): paragraphSplit types + constants

types: FontStyle, LineRange, MeasureResult, LineRangeMeasurer, SplitMetrics
const: SPLITTABLE_TAGS, MAX_SPLIT_RECURSION, SPLIT_HEIGHT_TOLERANCE_PX
EOF
)"
```

---

## Task 3: `isSplittableElement` (TDD)

**Files:**
- Modify: `viewer/src/lib/paragraphSplit.ts` (append export)
- Create: `viewer/src/lib/paragraphSplit.test.ts`

- [ ] **Step 1: 실패하는 test 작성**

`viewer/src/lib/paragraphSplit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isSplittableElement } from './paragraphSplit'

describe('isSplittableElement', () => {
  function el(tag: string): HTMLElement {
    return document.createElement(tag)
  }

  it('<p> → true', () => {
    expect(isSplittableElement(el('p'))).toBe(true)
  })

  it('<li> → true', () => {
    expect(isSplittableElement(el('li'))).toBe(true)
  })

  it('<h1>~<h6> → false', () => {
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      expect(isSplittableElement(el(tag))).toBe(false)
    }
  })

  it('<pre>, <code>, <table>, <img>, <ul>, <ol>, <blockquote>, <div> → false', () => {
    for (const tag of ['pre', 'code', 'table', 'img', 'ul', 'ol', 'blockquote', 'div']) {
      expect(isSplittableElement(el(tag))).toBe(false)
    }
  })

  it('대소문자 무관', () => {
    const p = document.createElement('P')
    expect(isSplittableElement(p)).toBe(true)
  })
})
```

- [ ] **Step 2: test 실패 확인**

```bash
cd viewer && npx vitest run src/lib/paragraphSplit.test.ts
```

Expected: FAIL — `isSplittableElement is not a function` 또는 import 오류.

- [ ] **Step 3: 최소 구현**

`viewer/src/lib/paragraphSplit.ts` 에 append:

```ts
export function isSplittableElement(el: HTMLElement): boolean {
  return SPLITTABLE_TAGS.has(el.tagName.toLowerCase())
}
```

- [ ] **Step 4: test 통과 확인**

```bash
cd viewer && npx vitest run src/lib/paragraphSplit.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/src/lib/paragraphSplit.ts viewer/src/lib/paragraphSplit.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): isSplittableElement — tag 기반 splittable 판단

<p>, <li> 만 splittable. heading/table/code/img/list-container 등은 false.
대소문자 무관. SPLITTABLE_TAGS 상수 사용.
EOF
)"
```

---

## Task 4: `pickSplitLine` (TDD)

`pickSplitLine` 책임: pretext 의 measure 결과 (`MeasureResult`) 와 페이지 inner height 를 받아 — 페이지에 들어가는 마지막 줄의 char index 와 그 줄까지의 height 를 반환. 분할 불필요 케이스도 같은 함수에서 결정.

**Files:**
- Modify: `viewer/src/lib/paragraphSplit.ts`
- Modify: `viewer/src/lib/paragraphSplit.test.ts`

- [ ] **Step 1: 실패하는 test 작성**

`paragraphSplit.test.ts` 에 append:

```ts
import { pickSplitLine } from './paragraphSplit'
import type { MeasureResult } from './paragraphSplit'

describe('pickSplitLine', () => {
  function makeResult(lineCount: number, lineHeight = 20): MeasureResult {
    const lines = Array.from({ length: lineCount }, (_, i) => ({
      startIdx: i * 10,
      endIdx: (i + 1) * 10
    }))
    return { lineHeight, lines }
  }

  it('전체 줄이 inner height 안에 들어가면 splitAt = null', () => {
    const result = makeResult(5, 20)  // 5 줄 × 20 = 100
    expect(pickSplitLine(result, 200)).toBeNull()
  })

  it('마지막 줄이 inner height 와 같아도 splitAt = null (정확히 맞음)', () => {
    const result = makeResult(5, 20)  // 100
    expect(pickSplitLine(result, 100)).toBeNull()
  })

  it('inner height 초과 시 들어가는 마지막 줄 char index 반환', () => {
    const result = makeResult(10, 20)  // 10 줄 × 20 = 200
    // limit=100 → 5 줄 들어감 (5×20=100). lines[4].endIdx = 50.
    expect(pickSplitLine(result, 100)).toBe(50)
  })

  it('inner height 가 한 줄도 못 들어갈 만큼 작으면 lines[0].endIdx (최소 1줄 보장)', () => {
    const result = makeResult(10, 30)
    // limit=10. 한 줄도 안 들어가지만 강제로 1줄.
    expect(pickSplitLine(result, 10)).toBe(10)
  })

  it('lines 가 비면 null', () => {
    const result: MeasureResult = { lineHeight: 20, lines: [] }
    expect(pickSplitLine(result, 100)).toBeNull()
  })

  it('lineHeight 가 0 이거나 음수면 null (방어)', () => {
    const result: MeasureResult = {
      lineHeight: 0,
      lines: [{ startIdx: 0, endIdx: 5 }]
    }
    expect(pickSplitLine(result, 100)).toBeNull()
  })
})
```

- [ ] **Step 2: test 실패 확인**

```bash
cd viewer && npx vitest run src/lib/paragraphSplit.test.ts -t pickSplitLine
```

Expected: FAIL.

- [ ] **Step 3: 구현**

`paragraphSplit.ts` 에 append:

```ts
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
```

- [ ] **Step 4: test 통과 확인**

```bash
cd viewer && npx vitest run src/lib/paragraphSplit.test.ts -t pickSplitLine
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/src/lib/paragraphSplit.ts viewer/src/lib/paragraphSplit.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): pickSplitLine — measure 결과 → split char index

전체 들어가면 null. 초과 시 floor(innerH/lineH) 줄까지의 endIdx.
한 줄도 안 들어가도 최소 1줄 강제 (무한 재귀 회피).
SPLIT_HEIGHT_TOLERANCE_PX 로 1px 오차 허용.
EOF
)"
```

---

## Task 5: `splitElementAtCharIndex` (TDD — 순수 DOM)

pretext 와 무관한 *순수 DOM 함수*. element 의 char count 누적으로 boundary textNode 를 찾아 Range 로 후반부 추출 → 새 element 생성.

**Files:**
- Modify: `viewer/src/lib/paragraphSplit.ts`
- Modify: `viewer/src/lib/paragraphSplit.test.ts`

- [ ] **Step 1: 실패하는 test 작성**

`paragraphSplit.test.ts` 에 append:

```ts
import { splitElementAtCharIndex } from './paragraphSplit'

describe('splitElementAtCharIndex', () => {
  it('단순 텍스트 split — boundary 가 textNode 내부', () => {
    const p = document.createElement('p')
    p.textContent = 'Hello World'  // 11 chars
    const tail = splitElementAtCharIndex(p, 5)
    expect(tail).not.toBeNull()
    expect(p.textContent).toBe('Hello')
    expect(tail!.textContent).toBe(' World')
    expect(tail!.tagName).toBe('P')
  })

  it('inline 마크업 양쪽으로 split', () => {
    const p = document.createElement('p')
    p.innerHTML = 'Hello <strong>brave</strong> world'
    // text: "Hello brave world" (17 chars). split at 8 → "Hello br" + "ave world"
    const tail = splitElementAtCharIndex(p, 8)
    expect(tail).not.toBeNull()
    expect(p.textContent).toBe('Hello br')
    expect(tail!.textContent).toBe('ave world')
    // <strong> 가 양쪽 모두에 있어야 함
    expect(p.querySelector('strong')?.textContent).toBe('br')
    expect(tail!.querySelector('strong')?.textContent).toBe('ave')
  })

  it('id 는 첫 part 만 유지, 후속에서는 제거', () => {
    const p = document.createElement('p')
    p.id = 'para-1'
    p.textContent = 'foo bar baz'
    const tail = splitElementAtCharIndex(p, 4)
    expect(p.id).toBe('para-1')
    expect(tail!.id).toBe('')
  })

  it('className 과 data-* attribute 복제', () => {
    const p = document.createElement('p')
    p.className = 'cls-a cls-b'
    p.setAttribute('data-foo', 'bar')
    p.setAttribute('aria-label', 'lbl')
    p.textContent = 'foo bar baz'
    const tail = splitElementAtCharIndex(p, 4)
    expect(tail!.className).toBe('cls-a cls-b')
    expect(tail!.getAttribute('data-foo')).toBe('bar')
    expect(tail!.getAttribute('aria-label')).toBe('lbl')
  })

  it('charIndex 가 0 → null (split 불가)', () => {
    const p = document.createElement('p')
    p.textContent = 'foo'
    expect(splitElementAtCharIndex(p, 0)).toBeNull()
  })

  it('charIndex 가 전체 char count 이상 → null', () => {
    const p = document.createElement('p')
    p.textContent = 'foo'
    expect(splitElementAtCharIndex(p, 99)).toBeNull()
  })

  it('빈 element → null', () => {
    const p = document.createElement('p')
    expect(splitElementAtCharIndex(p, 1)).toBeNull()
  })
})
```

- [ ] **Step 2: test 실패 확인**

```bash
cd viewer && npx vitest run src/lib/paragraphSplit.test.ts -t splitElementAtCharIndex
```

Expected: FAIL.

- [ ] **Step 3: 구현**

`paragraphSplit.ts` 에 append:

```ts
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

  const boundary = locateCharBoundary(el, charIndex)
  if (!boundary) return null

  const range = el.ownerDocument.createRange()
  range.setStart(boundary.node, boundary.offset)
  range.setEndAfter(el.lastChild!)
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
```

- [ ] **Step 4: test 통과 확인**

```bash
cd viewer && npx vitest run src/lib/paragraphSplit.test.ts -t splitElementAtCharIndex
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/src/lib/paragraphSplit.ts viewer/src/lib/paragraphSplit.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): splitElementAtCharIndex — 순수 DOM split

TreeWalker 로 textNode 누적 char count → Range.extractContents.
attribute 복제 (id 만 후속 part 에서 제거).
inline 마크업 (<strong> 등) 은 Range 가 자동 양쪽 분할.
charIndex 경계 케이스 (<=0, >=totalLength) 는 null 반환.
EOF
)"
```

---

## Task 6: `createPretextMeasurer` 어댑터

`@chenglou/pretext` 를 직접 import 하는 *유일한* 함수. paragraphSplit 의 다른 함수 들은 `LineRangeMeasurer` 인터페이스에만 의존 — 단위 테스트 시 fake 주입 가능.

**실 API 확인 결과 (Task 1 Step 3)**:
- `prepareWithSegments(text: string, font: string, options?: {whiteSpace, wordBreak, letterSpacing})` — 폰트는 CSS shorthand 문자열, lineHeight 는 옵션 아님
- `walkLineRanges(prepared, maxWidth, callback)` — callback (LayoutLineRange) → void. return 값 없음
- `materializeLineRange(prepared, line) → LayoutLine{text, ...}` — line 의 실 텍스트 추출

**전략**: walkLineRanges 콜백에서 materializeLineRange 로 줄별 text 수집 → 원본 text 안에서 indexOf 로 char range 매핑. 정규화로 매칭 실패 시 positional fallback (lineText.length 만큼 누적).

**Files:**
- Modify: `viewer/src/lib/paragraphSplit.ts`

- [ ] **Step 1: pretext 어댑터 함수 추가**

`paragraphSplit.ts` 에 append:

```ts
import {
  prepareWithSegments,
  walkLineRanges,
  materializeLineRange
} from '@chenglou/pretext'

/**
 * computed style → CSS font shorthand. pretext 가 받는 형식.
 */
function buildFontShorthand(style: FontStyle): string {
  const parts = [style.fontStyle, style.fontWeight, `${style.fontSize}px`, style.fontFamily]
  return parts.filter((p) => p && p !== 'normal').join(' ') || `${style.fontSize}px sans-serif`
}

/**
 * lineText → 원본 text 안의 char range 매핑. 정규화 (multi-space collapse 등)
 * 으로 indexOf 실패 시 positional 추정.
 */
export function mapLineTextsToRanges(text: string, lineTexts: string[]): LineRange[] {
  const lines: LineRange[] = []
  let pos = 0
  for (const lt of lineTexts) {
    if (lt.length === 0) continue
    const startIdx = text.indexOf(lt, pos)
    if (startIdx < 0) {
      // 정규화 손실 — positional 추정
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

/**
 * pretext 호출의 단일 진입점. 다른 함수는 LineRangeMeasurer 인터페이스만 사용
 * — 이 어댑터를 fake 로 교체 가능.
 */
export function createPretextMeasurer(): LineRangeMeasurer {
  return (text, style, widthPx) => {
    const font = buildFontShorthand(style)
    const prepared = prepareWithSegments(text, font, {
      whiteSpace: style.whiteSpace as Parameters<typeof prepareWithSegments>[2] extends infer O
        ? O extends { whiteSpace?: infer W }
          ? W
          : never
        : never,
      wordBreak: style.wordBreak as Parameters<typeof prepareWithSegments>[2] extends infer O
        ? O extends { wordBreak?: infer W }
          ? W
          : never
        : never,
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
```

**Note**: type 캐스팅이 복잡하므로 실 구현 시 `WhiteSpaceMode`/`WordBreakMode` 를 직접 import 가능하면 그쪽 사용. 안 되면 `as any` 도 허용 (boundary 어댑터라 strict typing 가치 < 단순함).

- [ ] **Step 1.5: mapLineTextsToRanges 단위 테스트**

`paragraphSplit.test.ts` 에 append:

```ts
import { mapLineTextsToRanges } from './paragraphSplit'

describe('mapLineTextsToRanges', () => {
  it('lineTexts 가 원본의 정확한 substring 이면 char range 매핑', () => {
    const text = 'Hello World Foo Bar'
    const lineTexts = ['Hello World', 'Foo Bar']
    expect(mapLineTextsToRanges(text, lineTexts)).toEqual([
      { startIdx: 0, endIdx: 11 },
      { startIdx: 12, endIdx: 19 }
    ])
  })

  it('lineText 가 정규화돼서 indexOf 실패 시 positional fallback', () => {
    const text = 'foo  bar'  // 2 spaces
    const lineTexts = ['foo bar']  // 1 space (정규화)
    const result = mapLineTextsToRanges(text, lineTexts)
    expect(result).toEqual([{ startIdx: 0, endIdx: 7 }])
  })

  it('빈 lineText 는 skip', () => {
    const text = 'foo bar'
    const lineTexts = ['foo', '', 'bar']
    expect(mapLineTextsToRanges(text, lineTexts)).toEqual([
      { startIdx: 0, endIdx: 3 },
      { startIdx: 4, endIdx: 7 }
    ])
  })

  it('빈 입력 → 빈 결과', () => {
    expect(mapLineTextsToRanges('foo', [])).toEqual([])
  })
})
```

- [ ] **Step 2: typecheck**

```bash
cd viewer && npm run typecheck
```

Expected: PASS. type 충돌 시 어댑터의 옵션 타입을 `as any` 로 단순화 가능.

- [ ] **Step 3: 신규 단위 테스트 + 기존 회귀**

```bash
cd viewer && npm test
```

Expected: 전체 PASS. createPretextMeasurer 자체는 단위 테스트 없음 (jsdom canvas 부재 — dogfood 에서 통합 검증).

- [ ] **Step 4: Commit**

```bash
git add viewer/src/lib/paragraphSplit.ts viewer/src/lib/paragraphSplit.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): createPretextMeasurer — pretext 어댑터 격리

@chenglou/pretext 직접 import 는 이 어댑터 한 곳만.
buildFontShorthand: FontStyle → CSS font 문자열.
mapLineTextsToRanges: lineText 배열 → 원본 char range (indexOf + fallback).
다른 함수는 LineRangeMeasurer 인터페이스에만 의존 (DI).
EOF
)"
```

- [ ] **Step 2: typecheck**

```bash
cd viewer && npm run typecheck
```

Expected: PASS. 만약 pretext 의 d.ts 시그니처가 다르면 here 에서 fix.

- [ ] **Step 3: 기존 테스트 회귀 검사**

```bash
cd viewer && npm test
```

Expected: 기존 테스트 모두 PASS. 신규 어댑터는 단위 테스트 없음 (jsdom canvas 부재 — 통합 검증은 dogfood 에서).

- [ ] **Step 4: Commit**

```bash
git add viewer/src/lib/paragraphSplit.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): createPretextMeasurer — pretext 어댑터 격리

@chenglou/pretext 직접 import 는 이 어댑터 한 곳만.
다른 함수는 LineRangeMeasurer 인터페이스에만 의존 (DI).
EOF
)"
```

---

## Task 7: `splitParagraph` (TDD — fake measurer 주입)

한 단락 1개를 받아 분할. measurer 주입으로 pretext 와 격리해 단위 테스트.

**Files:**
- Modify: `viewer/src/lib/paragraphSplit.ts`
- Modify: `viewer/src/lib/paragraphSplit.test.ts`

- [ ] **Step 1: 실패하는 test 작성**

`paragraphSplit.test.ts` 에 append:

```ts
import { splitParagraph } from './paragraphSplit'
import type { LineRangeMeasurer, MeasureResult, SplitMetrics } from './paragraphSplit'

function fakeMeasurer(perLineChars: number, lineHeight: number): LineRangeMeasurer {
  return (text) => {
    const lines = []
    for (let i = 0; i < text.length; i += perLineChars) {
      lines.push({ startIdx: i, endIdx: Math.min(i + perLineChars, text.length) })
    }
    return { lineHeight, lines }
  }
}

const noopMetrics: SplitMetrics = { innerWidthPx: 500, innerHeightPx: 100 }

describe('splitParagraph', () => {
  it('splittable 아닌 element 는 그대로 단일 배열로 반환', () => {
    const div = document.createElement('div')
    div.textContent = 'foo'
    const m = fakeMeasurer(2, 20)
    expect(splitParagraph(div, noopMetrics, m)).toEqual([div])
  })

  it('전체가 페이지에 들어가면 그대로 단일 배열', () => {
    const p = document.createElement('p')
    p.textContent = 'short text'  // 10 chars / 2 per line = 5 lines × 20 = 100 — 정확히 맞음
    const m = fakeMeasurer(2, 20)
    const result = splitParagraph(p, { innerWidthPx: 500, innerHeightPx: 100 }, m)
    expect(result).toEqual([p])
  })

  it('초과 시 줄 단위로 다중 element 분할', () => {
    const p = document.createElement('p')
    p.textContent = 'ABCDEFGHIJ'  // 10 chars / 2 per line = 5 lines
    const m = fakeMeasurer(2, 20)
    // innerHeight=40 → 2 줄까지 들어감 = 4 chars. 10 → 4 / 4 / 2 (3 단락).
    const result = splitParagraph(p, { innerWidthPx: 500, innerHeightPx: 40 }, m)
    expect(result.length).toBe(3)
    expect(result[0]!.textContent).toBe('ABCD')
    expect(result[1]!.textContent).toBe('EFGH')
    expect(result[2]!.textContent).toBe('IJ')
  })

  it('text 가 비어 있으면 그대로 단일 배열', () => {
    const p = document.createElement('p')
    const m = fakeMeasurer(2, 20)
    expect(splitParagraph(p, noopMetrics, m)).toEqual([p])
  })

  it('measurer 가 throw 하면 원본 그대로 (fallback)', () => {
    const p = document.createElement('p')
    p.textContent = 'ABCDEFGHIJ'
    const failing: LineRangeMeasurer = () => {
      throw new Error('canvas unavailable')
    }
    const result = splitParagraph(p, { innerWidthPx: 500, innerHeightPx: 40 }, failing)
    expect(result).toEqual([p])
  })

  it('재귀 depth 제한 — 무한 split 가드', () => {
    const p = document.createElement('p')
    p.textContent = 'A'.repeat(1000)
    // 항상 1 char 만 자르는 measurer → 무한 split 시도
    const stuck: LineRangeMeasurer = (text) => ({
      lineHeight: 100,
      lines: text.split('').map((_, i) => ({ startIdx: i, endIdx: i + 1 }))
    })
    const result = splitParagraph(p, { innerWidthPx: 500, innerHeightPx: 50 }, stuck)
    // MAX_SPLIT_RECURSION 내에서 멈춰야 함 — 무한 루프 안 됨.
    expect(result.length).toBeLessThanOrEqual(1000)
  })
})
```

- [ ] **Step 2: test 실패 확인**

```bash
cd viewer && npx vitest run src/lib/paragraphSplit.test.ts -t splitParagraph
```

Expected: FAIL.

- [ ] **Step 3: 구현**

`paragraphSplit.ts` 에 append:

```ts
/**
 * element 의 computed style 에서 pretext 입력용 FontStyle 추출.
 * 단위 테스트에서 호출 안 됨 (DOM 의존). 통합 단계에서만 사용.
 */
function readFontStyle(el: HTMLElement): FontStyle {
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el)
  return {
    fontFamily: cs.fontFamily,
    fontSize: parseFloat(cs.fontSize) || 16,
    fontWeight: cs.fontWeight,
    fontStyle: cs.fontStyle,
    lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 24,
    letterSpacing: parseFloat(cs.letterSpacing) || 0,
    whiteSpace: cs.whiteSpace,
    wordBreak: cs.wordBreak
  }
}

/**
 * 단일 element 분할. splittable 아니거나 fits 면 [el] 반환. 초과 시 재귀로 다수
 * element 반환. measurer 실패 시 [el] fallback.
 *
 * @param measurer DI — 단위 테스트에서 fake 주입. production 은
 *   createPretextMeasurer().
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
```

- [ ] **Step 4: test 통과 확인**

```bash
cd viewer && npx vitest run src/lib/paragraphSplit.test.ts -t splitParagraph
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/src/lib/paragraphSplit.ts viewer/src/lib/paragraphSplit.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): splitParagraph — measurer DI 기반 단락 분할

splittable 게이트 → measure → pickSplitLine → splitElementAtCharIndex 결합.
재귀로 N 분할. MAX_SPLIT_RECURSION 가드.
measurer throw 시 [el] fallback (원본 보존).
readFontStyle 가 computed style → FontStyle 변환.
EOF
)"
```

---

## Task 8: `expandLargeParagraphs` (TDD — DOM swap)

다수 children 에 대해 splitParagraph 를 적용하고 부모 DOM 도 swap.

**Files:**
- Modify: `viewer/src/lib/paragraphSplit.ts`
- Modify: `viewer/src/lib/paragraphSplit.test.ts`

- [ ] **Step 1: 실패하는 test 작성**

`paragraphSplit.test.ts` 에 append:

```ts
import { expandLargeParagraphs } from './paragraphSplit'

describe('expandLargeParagraphs', () => {
  it('parent DOM 에서 단락 swap — 결과 배열 순서 = DOM 순서', () => {
    const parent = document.createElement('section')
    const p1 = document.createElement('p')
    p1.textContent = 'ABCDEFGHIJ'  // 10 chars
    const p2 = document.createElement('p')
    p2.textContent = 'short'
    parent.appendChild(p1)
    parent.appendChild(p2)

    const m = fakeMeasurer(2, 20)
    // p1: 5 lines × 20 = 100. innerHeight=40 → 2 lines per page. 3 단락.
    // p2: 3 chars / 2 per line = 2 lines × 20 = 40. fits.
    const result = expandLargeParagraphs(
      parent,
      [p1, p2],
      { innerWidthPx: 500, innerHeightPx: 40 },
      m
    )

    expect(result.length).toBe(4)  // p1 → 3, p2 → 1
    expect(parent.children.length).toBe(4)
    expect(parent.children[0]!.textContent).toBe('ABCD')
    expect(parent.children[1]!.textContent).toBe('EFGH')
    expect(parent.children[2]!.textContent).toBe('IJ')
    expect(parent.children[3]!.textContent).toBe('short')
  })

  it('splittable 아닌 element 는 그대로 통과', () => {
    const parent = document.createElement('section')
    const div = document.createElement('div')
    div.textContent = 'unchangeable'
    parent.appendChild(div)
    const m = fakeMeasurer(2, 20)
    const result = expandLargeParagraphs(
      parent,
      [div],
      { innerWidthPx: 500, innerHeightPx: 10 },
      m
    )
    expect(result).toEqual([div])
    expect(parent.children[0]).toBe(div)
  })

  it('빈 children 배열 → 빈 결과', () => {
    const parent = document.createElement('section')
    const m = fakeMeasurer(2, 20)
    expect(expandLargeParagraphs(parent, [], noopMetrics, m)).toEqual([])
  })
})
```

- [ ] **Step 2: test 실패 확인**

```bash
cd viewer && npx vitest run src/lib/paragraphSplit.test.ts -t expandLargeParagraphs
```

Expected: FAIL.

- [ ] **Step 3: 구현**

`paragraphSplit.ts` 에 append:

```ts
/**
 * 다수 children 에 대해 splitParagraph 적용. 분할 결과를 parent DOM 에 in-place
 * swap (원본 위치에 분할 결과를 순서대로 삽입, 원본 제거).
 *
 * 호출 시점에 children 은 이미 measure 컨테이너 안에 있어 offsetHeight / 폰트
 * computed style 이 의미 있는 값을 가져야 한다.
 *
 * @returns 평탄화된 element 배열 (DOM 순서와 동일).
 */
export function expandLargeParagraphs(
  parent: HTMLElement,
  children: HTMLElement[],
  metrics: SplitMetrics,
  measurer: LineRangeMeasurer
): HTMLElement[] {
  const output: HTMLElement[] = []
  for (const child of children) {
    const parts = splitParagraph(child, metrics, measurer)
    if (parts.length === 1 && parts[0] === child) {
      output.push(child)
      continue
    }
    // swap: 원본 자리에 parts 를 순서대로 insert, 원본 제거.
    for (const part of parts) {
      parent.insertBefore(part, child)
    }
    parent.removeChild(child)
    output.push(...parts)
  }
  return output
}
```

- [ ] **Step 4: test 통과 확인**

```bash
cd viewer && npx vitest run src/lib/paragraphSplit.test.ts -t expandLargeParagraphs
```

Expected: PASS (3 tests).

- [ ] **Step 5: 전체 paragraphSplit 테스트 회귀 검사**

```bash
cd viewer && npx vitest run src/lib/paragraphSplit.test.ts
```

Expected: 전체 PASS (28 tests — 5 + 6 + 7 + 6 + 3 + 1 가능 변동).

- [ ] **Step 6: Commit**

```bash
git add viewer/src/lib/paragraphSplit.ts viewer/src/lib/paragraphSplit.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): expandLargeParagraphs — DOM swap + 평탄화

children 순회 → splitParagraph → 분할된 경우 parent DOM 에 in-place swap.
splittable 아니거나 fits 면 통과 (DOM 무변화).
EOF
)"
```

---

## Task 9: `paginateVertical` 통합

**Files:**
- Modify: `viewer/src/lib/paginate.ts`
- Modify: `viewer/src/lib/paginate.test.ts`

- [ ] **Step 1: 통합 테스트 작성 (failing)**

`paginate.test.ts` 에 append:

```ts
// (paginate.test.ts top imports 추가)
// 기존: import { clamp, mmToPx, round1, splitByHeight } from './paginate'

// paginateVertical 의 expandLargeParagraphs 통합 검증 — 실제 pretext 안 씀,
// 단락이 splittable 일 때 함수가 *호출되도록* 흐름이 바뀐 것만 확인. 측정
// 결과 검증은 paragraphSplit.test.ts 에서 이미 끝남.
//
// 여기서는 회귀 가드 — 짧은 단락만 있을 때 기존 동작 그대로.

import { paginateVertical } from './paginate'
import { VS_DEFAULTS } from '@/types/viewSettings'

describe('paginateVertical (회귀)', () => {
  it('짧은 단락은 기존과 동일 — 단일 paper-page 1개', () => {
    const content = document.createElement('div')
    const p = document.createElement('p')
    p.textContent = 'short'
    content.appendChild(p)
    document.body.appendChild(content)

    paginateVertical(content, { ...VS_DEFAULTS, layout: 'vertical', pageSize: 'A4' })

    const pages = content.querySelectorAll('.paper-page')
    expect(pages.length).toBe(1)
    expect(pages[0]!.textContent).toBe('short')
    document.body.removeChild(content)
  })
})
```

- [ ] **Step 2: test 실패 확인 (paginateVertical 가 export 라면 PASS, 통합 변경 전엔 회귀 가드만)**

```bash
cd viewer && npx vitest run src/lib/paginate.test.ts
```

Expected: PASS — 이 task 는 회귀 검사 추가가 목적이며, paginateVertical 의 기존 동작은 짧은 단락에 대해 동일.

- [ ] **Step 3: paginate.ts 수정**

`viewer/src/lib/paginate.ts` 의 import 에 추가:

```ts
import { createPretextMeasurer, expandLargeParagraphs } from './paragraphSplit'
```

`paginateVertical` 함수 변경:

```ts
export function paginateVertical(
  content: HTMLElement,
  settings: ViewSettings
): void {
  const dims = PAGE_DIMS[settings.pageSize]
  const innerHeightPx = mmToPx(
    dims.h - settings.marginTop - settings.marginBottom
  )
  const innerWidthPx = mmToPx(
    dims.w - settings.marginLeft - settings.marginRight
  )
  if (innerHeightPx <= 0 || innerWidthPx <= 0) return

  const flat = Array.from(content.children) as HTMLElement[]
  if (flat.length === 0) return

  const initialPage = createPaperPage()
  for (const child of flat) initialPage.appendChild(child)
  content.innerHTML = ''
  content.appendChild(initialPage)

  const expanded = expandLargeParagraphs(
    initialPage,
    flat,
    { innerWidthPx, innerHeightPx },
    createPretextMeasurer()
  )
  const heights = expanded.map((c) => c.offsetHeight)
  const groups = splitByHeight(heights, innerHeightPx)

  content.innerHTML = ''
  for (const group of groups) {
    const page = createPaperPage()
    for (const idx of group) page.appendChild(expanded[idx]!)
    content.appendChild(page)
  }
}
```

- [ ] **Step 4: test 통과 확인**

```bash
cd viewer && npx vitest run src/lib/paginate.test.ts
```

Expected: 모든 paginate 테스트 PASS — 신규 회귀 가드 포함.

- [ ] **Step 5: typecheck**

```bash
cd viewer && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add viewer/src/lib/paginate.ts viewer/src/lib/paginate.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): paginateVertical — expandLargeParagraphs 통합

splitByHeight 호출 직전에 사전 분할 단계 추가. 단락이 inner height
초과 시 pretext 로 줄 단위 split → splitByHeight 가 분할된 단락을
페이지에 자연스럽게 배치.

innerWidthPx 계산 추가 (mmToPx(w - marginL - marginR)).
EOF
)"
```

---

## Task 10: `paginateStrip` 통합

**Files:**
- Modify: `viewer/src/lib/paginate.ts`

- [ ] **Step 1: paginateStrip 변경**

```ts
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
  const expanded = expandLargeParagraphs(
    measure,
    flat,
    { innerWidthPx, innerHeightPx: fit.innerHeight },
    createPretextMeasurer()
  )
  const heights = expanded.map((c) => c.offsetHeight)
  const groups = splitByHeight(heights, fit.innerHeight)

  content.innerHTML = ''
  const strip = document.createElement('div')
  strip.className = 'page-strip'
  for (const group of groups) {
    const page = createPaperPage()
    applyFitDims(page, fit)
    for (const idx of group) page.appendChild(expanded[idx]!)
    strip.appendChild(page)
  }
  content.appendChild(strip)
  return { totalPages: groups.length, fit, strip }
}
```

- [ ] **Step 2: 전체 viewer 테스트 회귀 검사**

```bash
cd viewer && npm test
```

Expected: 전체 PASS — 회귀 없음.

- [ ] **Step 3: typecheck + lint**

```bash
cd viewer && npm run typecheck && npm run lint
```

Expected: PASS.

- [ ] **Step 4: 빌드 회귀 검사**

```bash
cd viewer && npm run build 2>&1 | tail -20
```

Expected: 빌드 성공. 번들 size 가 Task 1 의 baseline + pretext 분량 정도. 비정상적 증가 없는지 확인.

- [ ] **Step 5: Commit**

```bash
git add viewer/src/lib/paginate.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): paginateStrip — expandLargeParagraphs 통합

horizontal / two-pages 모드도 paginateVertical 과 동일한 사전 분할
단계 적용. innerWidthPx = fit.width - fit.padLeft - fit.padRight.

vertical / horizontal / two-pages 세 모드 모두 단락 overflow 해결.
EOF
)"
```

---

## Task 11: dogfood 수동 검증 + 핸드오프

**Files:**
- Create: `docs/superpowers/handoffs/2026-04-27-pretext-pagination-completion.md`

- [ ] **Step 1: viewer dev 서버 띄우고 자기소개서 노트로 수동 검증**

`notedrop-dogfood-automation` skill 의 가이드 따라:

```bash
# (사용자 vault 의 자기소개서 노트 publish 또는 local preview)
cd viewer && npm run dev
```

브라우저에서:
1. **Vertical Scroll** + B5 + 긴 단락 노트 → 단락이 페이지 경계에서 자연스럽게 다음 페이지로 이어지는지
2. **Horizontal Scroll** + 동일 노트 → 좌우 strip 이동 + 단락 분할 작동
3. **Two Pages** + 동일 노트 → 두 페이지 동시 표시 + 단락 분할 작동
4. font-size / line-height / margin 슬라이더 변경 → re-paginate 후 단락 분할 재계산
5. inline 마크업 (a/strong/code) 포함 단락도 분할 boundary 가 의미적으로 합리적인지

- [ ] **Step 2: 회귀 검사 — 짧은 단락 노트**

이미지/테이블/코드블록 포함 노트 (자기소개서 외) 로 회귀 없음 확인:
- 이미지가 단독 페이지 점유하는지
- 코드 블록이 분할 안 되고 통째로 한 페이지에 들어가는지
- heading 이 다음 단락과 같은 페이지 시작에 위치하는지

- [ ] **Step 3: 번들 size diff 정리**

```bash
cd viewer && npm run build 2>&1 | grep -E 'First Load|chunks'
```

Task 1 의 baseline 과 비교 → 핸드오프에 기록.

- [ ] **Step 4: 핸드오프 문서 작성**

`docs/superpowers/handoffs/2026-04-27-pretext-pagination-completion.md` 생성:

```markdown
---
date: 2026-04-27
type: 핸드오프
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - viewer
  - pagination
  - pretext
summary: pretext 기반 단락 내부 분할 구현 완료. paragraphSplit 모듈 신설 + paginateVertical/paginateStrip 통합. vertical/horizontal/two-pages 세 모드 모두 긴 단락 overflow 해소.
related:
  - docs/superpowers/specs/2026-04-27-pretext-paragraph-pagination-design.md
  - docs/superpowers/plans/2026-04-27-pretext-paragraph-pagination.md
---

# pretext 기반 단락 내부 분할 — 완료 핸드오프

## 결과
- viewer test: <기존 N> + <신규 ~22> = <합계>
- 번들 size: baseline <KB> → <KB> (+<KB>)
- vertical / horizontal / two-pages 세 모드 단락 overflow 해소 확인 (dogfood)

## 신규 모듈 — paragraphSplit
- isSplittableElement / pickSplitLine / splitElementAtCharIndex (순수 함수)
- createPretextMeasurer (pretext 어댑터, 단일 import 지점)
- splitParagraph / expandLargeParagraphs (통합)

## 통합 지점
- paginate.ts 의 paginateVertical / paginateStrip 두 곳에 expandLargeParagraphs 호출
- splitByHeight 는 변경 없음

## 후속 이슈 (1차 미포함)
- callout / blockquote 내부 긴 텍스트 분할
- 단일 table / pre code block 이 페이지보다 큰 경우 row / line 분할
- unpaginate 시 split 단락 복원 (data-original-text 기반)
- font-size 변경 시 점진적 re-paginate

## 다음 세션 의무
- 사용자 vault 의 자기소개서 노트로 BRAT update 후 *실 dogfood* (사용자가 publish 클릭 → share repo 부작용)
- 번들 size 증가가 plugin 다운로드에 미치는 체감 영향 모니터링
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/handoffs/2026-04-27-pretext-pagination-completion.md
git commit -m "$(cat <<'EOF'
📝 docs(handoff): pretext 단락 분할 구현 완료 핸드오프

vertical / horizontal / two-pages 세 모드 단락 overflow 해소.
paragraphSplit 신규 모듈 + paginate 통합. 기존 splitByHeight 무변경.
번들 size: baseline <KB> → <KB> (+<KB>).
EOF
)"
```

---

## Self-Review Checklist (작성자 본인)

- [ ] **Spec coverage** — spec §1~§12 의 모든 결정사항이 task 에 매핑됐는가?
  - §3 (의존성) → Task 1
  - §5.1 (공개 API) → Task 2 (types)
  - §5.2 (splitParagraph 알고리즘) → Task 3, 4, 5, 6, 7
  - §5.3 (inline 마크업) → Task 5 의 splitElementAtCharIndex 테스트
  - §5.4 (expandLargeParagraphs) → Task 8
  - §6.1 / §6.2 (통합) → Task 9, 10
  - §7 (splittable 규칙) → Task 3
  - §8 (테스트 전략) → 전 task 의 measurer 주입 + Task 11 dogfood
  - §9 (회귀 risk) → Task 7 의 측정 실패 fallback / 무한 재귀 가드 / Task 11 회귀 검사
  - §10 (후속 이슈) → 핸드오프 §후속 이슈
  - §11 (결정사항) → Task 1 결정 검증, 그 외 task 별 적용
- [ ] **Placeholder scan** — 모든 코드 블록이 실제 구현 코드. TBD/TODO 없음.
- [ ] **Type consistency** — `LineRangeMeasurer`, `MeasureResult`, `SplitMetrics`, `FontStyle` 모두 Task 2 정의와 후속 task 사용처 일치.
- [ ] **Task 1 의 실 API 검증 결과로 Task 6 의 코드 갱신 필요** — Task 6 시작 전 plan 자체 갱신 의무 명시.
- [ ] **상수화 의무** — 모든 임계값 (50, 1, 0) 이 named const (MAX_SPLIT_RECURSION, SPLIT_HEIGHT_TOLERANCE_PX) 로 정의됨.

---

## 실행 옵션

Plan saved to `docs/superpowers/plans/2026-04-27-pretext-paragraph-pagination.md`.

**Inline Execution** 으로 진행 (auto mode 활성, 사용자 "구현해주세요" 명시) — `superpowers:executing-plans` skill 로 task 1 부터 순차 실행.
