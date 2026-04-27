# line-by-line paginate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** paginate 1차 단위를 element 에서 line 으로 변경. 모든 settings 변경 (font/margin/lineScale/pageSize/window resize) 시 line 단위 즉시 반응. heading orphan 방지 + table/pre/img 단위 보존 + window resize listener.

**Architecture:** 신규 모듈 `viewer/src/lib/lineStream.ts` 가 buildLineStream / splitByLineHeight / groupLinesBySource / renderLineGroups 책임. paginate.ts 의 paginateVertical / paginateStrip 가 splitByHeight 호출 → 신규 3 단계 파이프라인 호출. paragraphSplit.ts 의 helper (isSplittableElement / splitElementAtCharIndex / mapLineTextsToRanges / createPretextMeasurer) 재사용.

**Tech Stack:** TypeScript / Next.js / vitest + jsdom / `@chenglou/pretext` v0.0.6 / 기존 paginate + paragraphSplit lib.

**원칙:**
- 매직 넘버 / 매직 문자열 금지 — 모든 임계값 named const
- DI (measurer 주입) — paragraphSplit 의 LineRangeMeasurer 인터페이스 재사용
- 단일 책임 함수 — 한 export 한 결정
- TDD — 순수 함수 + DI 함수 모두 단위 테스트 우선
- 각 task 단위 commit

**관련 spec:** `docs/superpowers/specs/2026-04-27-line-by-line-paginate-design.md`

---

## File Structure

| 파일 | 책임 | 동작 |
|---|---|---|
| `viewer/src/lib/lineStream.ts` | 신규 모듈. Line type + buildLineStream + splitByLineHeight + groupLinesBySource + renderLineGroups | Create |
| `viewer/src/lib/lineStream.test.ts` | 신규 단위 테스트 | Create |
| `viewer/src/lib/paragraphSplit.ts` | expandLargeParagraphs / splitParagraph 폐기 (재사용 helper 만 유지) | Modify |
| `viewer/src/lib/paragraphSplit.test.ts` | 폐기되는 함수 테스트 제거 | Modify |
| `viewer/src/lib/paginate.ts` | splitByHeight 폐기, paginateVertical/Strip 가 lineStream 파이프라인 호출 | Modify |
| `viewer/src/lib/paginate.test.ts` | splitByHeight 테스트 폐기, 새 회귀 가드 | Modify |
| `viewer/src/hooks/useLayoutPagination.ts` | window resize listener 추가 (debounce 200ms) | Modify |
| `docs/0028-line-based-paginate.md` (선택) | ADR | Create (v0.1.52 release 시점) |
| `docs/superpowers/handoffs/2026-04-27-line-by-line-paginate-completion.md` | 완료 핸드오프 | Create |

---

## Task 1: Line type + 상수 + isInlineSplittable / isUnitElement 분류

**Files:**
- Create: `viewer/src/lib/lineStream.ts`

- [ ] **Step 1: lineStream.ts 의 type + 상수 + 분류 helper 작성**

```ts
/**
 * Line-단위 paginate 의 1차 단위. element 단위 splitByHeight 를 대체.
 *
 * 책임 분리 (export):
 *  - Line, LineKind type
 *  - SHORT_PARAGRAPH_RATIO 상수
 *  - isInlineSplittable / isUnitElement / isListContainer (tag 분류)
 *  - buildLineStream — element[] → Line[]
 *  - splitByLineHeight — Line[] → Line[][] (heading orphan 포함)
 *  - groupLinesBySource — page group 안의 line 들을 source 별로 묶기
 *  - renderLineGroups — Line[][] → DOM 재구성
 */

import {
  type FontStyle,
  type LineRange,
  type LineRangeMeasurer,
  isSplittableElement,
  splitElementAtCharIndex
} from './paragraphSplit'

export type LineKind = 'paragraph' | 'heading' | 'unit' | 'list-item'

export type Line = {
  source: HTMLElement
  charStart: number   // -1 = 전체 element
  charEnd: number     // exclusive
  height: number
  splittable: boolean
  breakAfterAvoid: boolean
  kind: LineKind
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

const HEADING_TAGS: ReadonlySet<string> = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

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
  // .callout div 도 unit
  if (tag === 'div' && el.classList.contains('callout')) return true
  return false
}

export function isListContainer(el: HTMLElement): boolean {
  return LIST_CONTAINER_TAGS.has(el.tagName.toLowerCase())
}
```

- [ ] **Step 2: typecheck 통과 확인**

```bash
cd viewer && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add viewer/src/lib/lineStream.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): lineStream types + tag 분류

types: Line, LineKind. const: SHORT_PARAGRAPH_RATIO.
helpers: isInlineSplittable, isHeading, isUnitElement, isListContainer.
paragraphSplit 의 helper (FontStyle, LineRangeMeasurer, splitElementAtCharIndex) 재사용.
EOF
)"
```

---

## Task 2: `splitByLineHeight` (TDD — 순수 함수)

**Files:**
- Modify: `viewer/src/lib/lineStream.ts` (append)
- Create: `viewer/src/lib/lineStream.test.ts`

- [ ] **Step 1: 실패하는 test 작성**

`viewer/src/lib/lineStream.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { splitByLineHeight } from './lineStream'
import type { Line, LineKind } from './lineStream'

function L(opts: Partial<Line>): Line {
  return {
    source: document.createElement('p'),
    charStart: 0,
    charEnd: 10,
    height: 20,
    splittable: true,
    breakAfterAvoid: false,
    kind: 'paragraph',
    ...opts
  }
}

describe('splitByLineHeight', () => {
  it('전부 들어가면 1 group', () => {
    const lines = [L({}), L({}), L({})]  // 3 × 20 = 60
    expect(splitByLineHeight(lines, 100)).toEqual([lines])
  })

  it('초과 시 새 group', () => {
    const lines = Array.from({length: 6}, () => L({}))  // 6 × 20 = 120
    const groups = splitByLineHeight(lines, 100)
    expect(groups.length).toBe(2)
    expect(groups[0]!.length).toBe(5)  // 5 × 20 = 100
    expect(groups[1]!.length).toBe(1)
  })

  it('빈 line 배열 → 빈 group 1개', () => {
    expect(splitByLineHeight([], 100)).toEqual([[]])
  })

  it('단일 line 이 inner 보다 커도 그대로 push (overflow 보존)', () => {
    const lines = [L({ height: 200 }), L({})]
    const groups = splitByLineHeight(lines, 100)
    expect(groups.length).toBe(2)
    expect(groups[0]!.length).toBe(1)
    expect(groups[1]!.length).toBe(1)
  })

  it('heading orphan 방지 — heading 이 group 마지막에 단독 → 다음 group 으로 이동', () => {
    const heading = L({ height: 30, breakAfterAvoid: true, kind: 'heading' })
    const para = L({ height: 80 })
    // heading(30) + para(80) = 110 > 100. 만약 단순 split 면 [heading], [para].
    // orphan 방지: heading 도 다음 group 으로 → [], [heading, para]. 또는 첫 group 비우는
    // 대신 heading 만 다음으로 이동.
    const groups = splitByLineHeight([heading, para], 100)
    // heading 이 page 시작에 위치 (orphan 방지 효과)
    expect(groups[0]!.includes(heading)).toBe(false)
    expect(groups[1]![0]).toBe(heading)
    expect(groups[1]![1]).toBe(para)
  })

  it('heading 이 마지막 line (다음 line 없음) → 그대로 push (orphan 허용 — empty page 만들기 더 나쁨)', () => {
    const heading = L({ height: 30, breakAfterAvoid: true, kind: 'heading' })
    const groups = splitByLineHeight([heading], 100)
    expect(groups).toEqual([[heading]])
  })
})
```

- [ ] **Step 2: test 실패 확인**

```bash
cd viewer && npx vitest run src/lib/lineStream.test.ts
```

Expected: FAIL — `splitByLineHeight is not a function`.

- [ ] **Step 3: 구현**

`lineStream.ts` 에 append:

```ts
/**
 * Line[] → page groups. heading orphan 방지 규칙 포함.
 *
 * heading orphan: heading line 이 group 의 *마지막* 위치이고 다음 line 이
 * 같은 group 에 못 들어가면 → heading 도 다음 group 으로 이동 (의미 단위
 * 보존). 단 heading 이 *전체 line 의 마지막* 이면 그대로 (빈 group 만들기
 * 더 나쁨).
 */
export function splitByLineHeight(
  lines: Line[],
  innerHeightPx: number
): Line[][] {
  const groups: Line[][] = [[]]
  let used = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const last = groups[groups.length - 1]!

    if (used + line.height > innerHeightPx && last.length > 0) {
      groups.push([])
      used = 0
    }
    last.push(line)
    used += line.height

    // heading orphan 방지 — line 이 push 된 직후 검사
    const isLastInGroup = i === lines.length - 1 ||
      used + (lines[i + 1]?.height ?? 0) > innerHeightPx
    if (
      line.breakAfterAvoid &&
      isLastInGroup &&
      i < lines.length - 1 &&  // 전체 마지막 line 이 아님
      last.length > 1  // heading 단독으로만 있는 group 만드는 건 회피
    ) {
      // heading 을 다음 group 의 첫 line 으로 이동
      const grp = groups[groups.length - 1]!
      grp.pop()
      groups.push([line])
      used = line.height
    }
  }

  return groups
}
```

- [ ] **Step 4: test 통과 확인**

```bash
cd viewer && npx vitest run src/lib/lineStream.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/src/lib/lineStream.ts viewer/src/lib/lineStream.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): splitByLineHeight — Line[] → page groups

heading orphan 방지: heading 이 group 마지막에 단독 위치 시 다음 group 으로
이동 (단 전체 마지막 line 일 때는 그대로).
TDD: 6 tests pass.
EOF
)"
```

---

## Task 3: `buildLineStream` (TDD — DI measurer)

**Files:**
- Modify: `viewer/src/lib/lineStream.ts`
- Modify: `viewer/src/lib/lineStream.test.ts`

- [ ] **Step 1: 실패하는 test 작성**

`lineStream.test.ts` 에 append:

```ts
import { buildLineStream, SHORT_PARAGRAPH_RATIO } from './lineStream'
import type { LineRangeMeasurer } from './paragraphSplit'

function fakeMeasurer(perLineChars: number, lineHeight: number): LineRangeMeasurer {
  return (text) => {
    const lines = []
    for (let i = 0; i < text.length; i += perLineChars) {
      lines.push({ startIdx: i, endIdx: Math.min(i + perLineChars, text.length) })
    }
    return { lineHeight, lines }
  }
}

describe('buildLineStream', () => {
  function setupParent(htmlList: string[]): HTMLElement {
    const parent = document.createElement('section')
    for (const html of htmlList) {
      parent.insertAdjacentHTML('beforeend', html)
    }
    document.body.appendChild(parent)
    return parent
  }

  it('<p> 분할 — measurer 결과 N line', () => {
    const parent = setupParent(['<p>ABCDEFGHIJ</p>'])  // 10 chars
    const m = fakeMeasurer(2, 20)
    const lines = buildLineStream(
      [parent.firstElementChild as HTMLElement],
      { innerWidthPx: 500, innerHeightPx: 100 },
      m
    )
    expect(lines.length).toBe(5)
    expect(lines[0]!.charStart).toBe(0)
    expect(lines[0]!.charEnd).toBe(2)
    expect(lines[0]!.kind).toBe('paragraph')
    expect(lines[0]!.height).toBe(20)
    document.body.removeChild(parent)
  })

  it('heading 은 line 1 개 + breakAfterAvoid', () => {
    const parent = setupParent(['<h2>제목</h2>'])
    const h = parent.firstElementChild as HTMLElement
    const m = fakeMeasurer(2, 20)
    const lines = buildLineStream([h], { innerWidthPx: 500, innerHeightPx: 100 }, m)
    expect(lines.length).toBe(1)
    expect(lines[0]!.kind).toBe('heading')
    expect(lines[0]!.breakAfterAvoid).toBe(true)
    expect(lines[0]!.splittable).toBe(false)
    document.body.removeChild(parent)
  })

  it('unit element (table/pre/img) 는 line 1 개', () => {
    const parent = setupParent(['<pre>code</pre>', '<table><tr><td>x</td></tr></table>', '<img src="x">'])
    const els = Array.from(parent.children) as HTMLElement[]
    const m = fakeMeasurer(2, 20)
    const lines = buildLineStream(els, { innerWidthPx: 500, innerHeightPx: 100 }, m)
    expect(lines.length).toBe(3)
    for (const l of lines) {
      expect(l.kind).toBe('unit')
      expect(l.splittable).toBe(false)
    }
    document.body.removeChild(parent)
  })

  it('<ul> 컨테이너 → 자식 <li> 들이 line 으로', () => {
    const parent = setupParent(['<ul><li>A</li><li>B</li></ul>'])
    const ul = parent.firstElementChild as HTMLElement
    const m = fakeMeasurer(2, 20)
    const lines = buildLineStream([ul], { innerWidthPx: 500, innerHeightPx: 100 }, m)
    // <li> 가 짧으면 1 line each. 결과 2 line.
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines[0]!.kind).toBe('list-item')
    document.body.removeChild(parent)
  })

  it('짧은 <p> (offsetHeight ≤ lineHeight × ratio) 는 measurer skip — line 1 개', () => {
    const parent = setupParent(['<p>x</p>'])
    const p = parent.firstElementChild as HTMLElement
    let measureCallCount = 0
    const m: LineRangeMeasurer = (text) => {
      measureCallCount++
      return fakeMeasurer(2, 20)(text, {} as any, 0)
    }
    // jsdom 의 offsetHeight 는 0 이라 short-paragraph 게이트 통과 — measure skip
    const lines = buildLineStream([p], { innerWidthPx: 500, innerHeightPx: 100 }, m)
    expect(measureCallCount).toBe(0)  // skip
    expect(lines.length).toBe(1)
    document.body.removeChild(parent)
  })

  it('measurer throw 시 element 단위 line 1 개 fallback', () => {
    const parent = setupParent(['<p>긴 단락 ' + 'x'.repeat(500) + '</p>'])
    const p = parent.firstElementChild as HTMLElement
    // jsdom 에서 offsetHeight 가 0 이라 보통 fallback 안 들어가지만, 강제로 측정 trigger
    // 위해 짧은 단락 검사 우회.
    Object.defineProperty(p, 'offsetHeight', { value: 1000, configurable: true })
    const failing: LineRangeMeasurer = () => { throw new Error('canvas unavailable') }
    const lines = buildLineStream([p], { innerWidthPx: 500, innerHeightPx: 100 }, failing)
    expect(lines.length).toBe(1)
    expect(lines[0]!.splittable).toBe(false)
    document.body.removeChild(parent)
  })
})
```

- [ ] **Step 2: test 실패 확인**

```bash
cd viewer && npx vitest run src/lib/lineStream.test.ts -t buildLineStream
```

Expected: FAIL.

- [ ] **Step 3: 구현**

`lineStream.ts` 에 append:

```ts
import { mapLineTextsToRanges } from './paragraphSplit'  // helper 재사용 — 또는 measurer 의 LineRange 결과 직접 사용

export type LineStreamMetrics = {
  innerWidthPx: number
  innerHeightPx: number
}

/** element 의 computed style → FontStyle. paragraphSplit 의 readFontStyle 와 동일 — 재사용. */
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

export function buildLineStream(
  children: HTMLElement[],
  metrics: LineStreamMetrics,
  measurer: LineRangeMeasurer
): Line[] {
  const out: Line[] = []
  for (const child of children) {
    if (isListContainer(child)) {
      // 자식 <li> 들을 재귀로 처리
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
      if (text.length === 0) {
        out.push({
          source: child,
          charStart: -1,
          charEnd: -1,
          height: child.offsetHeight,
          splittable: false,
          breakAfterAvoid: false,
          kind: child.tagName.toLowerCase() === 'li' ? 'list-item' : 'paragraph'
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
          kind: child.tagName.toLowerCase() === 'li' ? 'list-item' : 'paragraph'
        })
        continue
      }
      let measured: { lineHeight: number; lines: { startIdx: number; endIdx: number }[] }
      try {
        measured = measurer(text, style, metrics.innerWidthPx)
      } catch {
        // fallback — element 단위 1 line
        out.push({
          source: child,
          charStart: -1,
          charEnd: -1,
          height: child.offsetHeight,
          splittable: false,
          breakAfterAvoid: false,
          kind: 'paragraph'
        })
        continue
      }
      const kind = child.tagName.toLowerCase() === 'li' ? 'list-item' : 'paragraph'
      for (const lr of measured.lines) {
        out.push({
          source: child,
          charStart: lr.startIdx,
          charEnd: lr.endIdx,
          height: measured.lineHeight,
          splittable: true,
          breakAfterAvoid: false,
          kind
        })
      }
      continue
    }
    // 알 수 없는 element — unit 으로 취급
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
```

`lineStream.ts` 의 import 에 `FontStyle` 추가:
```ts
import {
  type FontStyle,
  type LineRange,
  type LineRangeMeasurer,
  isSplittableElement,
  splitElementAtCharIndex
} from './paragraphSplit'
```

- [ ] **Step 4: test 통과 확인**

```bash
cd viewer && npx vitest run src/lib/lineStream.test.ts
```

Expected: PASS (12 tests — 6 splitByLineHeight + 6 buildLineStream).

- [ ] **Step 5: Commit**

```bash
git add viewer/src/lib/lineStream.ts viewer/src/lib/lineStream.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): buildLineStream — element[] → Line[]

paragraph: measurer 결과 N line. heading: 1 line + breakAfterAvoid.
unit: 1 line + splittable=false. list 컨테이너: 자식 li 재귀.
짧은 단락 (offsetHeight ≤ lineHeight×1.5) measurer skip.
measurer throw 시 element 단위 1 line fallback.
TDD: 6 tests pass (cumulative 12).
EOF
)"
```

---

## Task 4: `groupLinesBySource` + `renderLineGroups` (TDD)

**Files:**
- Modify: `viewer/src/lib/lineStream.ts`
- Modify: `viewer/src/lib/lineStream.test.ts`

- [ ] **Step 1: failing test (groupLinesBySource — pure)**

`lineStream.test.ts` 에 append:

```ts
import { groupLinesBySource } from './lineStream'

describe('groupLinesBySource', () => {
  it('연속 same source 의 line 들을 묶음', () => {
    const p1 = document.createElement('p')
    const p2 = document.createElement('p')
    const lines: Line[] = [
      L({ source: p1, charStart: 0, charEnd: 5 }),
      L({ source: p1, charStart: 5, charEnd: 10 }),
      L({ source: p2, charStart: 0, charEnd: 5 })
    ]
    const groups = groupLinesBySource(lines)
    expect(groups.length).toBe(2)
    expect(groups[0]!.source).toBe(p1)
    expect(groups[0]!.lines.length).toBe(2)
    expect(groups[1]!.source).toBe(p2)
  })

  it('빈 입력 → 빈 출력', () => {
    expect(groupLinesBySource([])).toEqual([])
  })
})
```

- [ ] **Step 2: 구현 (group helper)**

```ts
export type SourceGroup = {
  source: HTMLElement
  lines: Line[]
}

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
```

- [ ] **Step 3: failing test (renderLineGroups — DOM rebuild)**

```ts
import { renderLineGroups } from './lineStream'

describe('renderLineGroups', () => {
  it('한 page group — same source 의 모든 line → source 그대로', () => {
    const parent = document.createElement('div')
    const p = document.createElement('p')
    p.textContent = 'ABCDEFGHIJ'
    parent.appendChild(p)
    document.body.appendChild(parent)

    const lines: Line[] = [
      L({ source: p, charStart: 0, charEnd: 5, splittable: true }),
      L({ source: p, charStart: 5, charEnd: 10, splittable: true })
    ]
    renderLineGroups(parent, [lines])
    const pages = parent.querySelectorAll('.paper-page')
    expect(pages.length).toBe(1)
    expect(pages[0]!.children.length).toBe(1)
    expect(pages[0]!.firstElementChild?.textContent).toBe('ABCDEFGHIJ')
    document.body.removeChild(parent)
  })

  it('두 page — 같은 source 가 split 되면 element 도 split', () => {
    const parent = document.createElement('div')
    const p = document.createElement('p')
    p.textContent = 'ABCDEFGHIJ'
    parent.appendChild(p)
    document.body.appendChild(parent)

    const lines: Line[] = [
      L({ source: p, charStart: 0, charEnd: 5, splittable: true }),
      L({ source: p, charStart: 5, charEnd: 10, splittable: true })
    ]
    renderLineGroups(parent, [lines.slice(0, 1), lines.slice(1)])
    const pages = parent.querySelectorAll('.paper-page')
    expect(pages.length).toBe(2)
    expect(pages[0]!.firstElementChild?.textContent).toBe('ABCDE')
    expect(pages[1]!.firstElementChild?.textContent).toBe('FGHIJ')
    document.body.removeChild(parent)
  })

  it('non-splittable element 는 한 page 에만 위치', () => {
    const parent = document.createElement('div')
    const h = document.createElement('h2')
    h.textContent = '제목'
    parent.appendChild(h)
    document.body.appendChild(parent)

    const lines: Line[] = [
      L({ source: h, charStart: -1, charEnd: -1, splittable: false, kind: 'heading', breakAfterAvoid: true })
    ]
    renderLineGroups(parent, [lines])
    const pages = parent.querySelectorAll('.paper-page')
    expect(pages.length).toBe(1)
    expect(pages[0]!.firstElementChild?.tagName).toBe('H2')
    document.body.removeChild(parent)
  })

  it('list-item 들은 새 <ul> 으로 wrap', () => {
    const parent = document.createElement('div')
    parent.innerHTML = '<ul><li>A</li><li>B</li></ul>'
    document.body.appendChild(parent)
    const ul = parent.firstElementChild as HTMLElement
    const liA = ul.children[0] as HTMLElement
    const liB = ul.children[1] as HTMLElement

    const lines: Line[] = [
      L({ source: liA, charStart: -1, charEnd: -1, splittable: false, kind: 'list-item' }),
      L({ source: liB, charStart: -1, charEnd: -1, splittable: false, kind: 'list-item' })
    ]
    renderLineGroups(parent, [lines])
    const pages = parent.querySelectorAll('.paper-page')
    expect(pages.length).toBe(1)
    const newUl = pages[0]!.firstElementChild
    expect(newUl?.tagName).toBe('UL')
    expect(newUl?.children.length).toBe(2)
    expect(newUl?.children[0]?.textContent).toBe('A')
    document.body.removeChild(parent)
  })
})
```

- [ ] **Step 4: 구현 (renderLineGroups)**

```ts
function createPaperPage(doc: Document): HTMLElement {
  const page = doc.createElement('section')
  page.className = 'paper-page'
  return page
}

/**
 * Line[][] → DOM. 각 group 마다 paper-page 1개 생성. 같은 source 의 연속 line 들은
 * 한 element 로 묶음 (splittable 면 charRange 기준 splitElementAtCharIndex 호출).
 * list-item 들은 부모 <ul>/<ol> 새로 만들어서 wrap.
 */
export function renderLineGroups(
  parent: HTMLElement,
  groups: Line[][]
): void {
  const doc = parent.ownerDocument
  parent.innerHTML = ''

  for (const groupLines of groups) {
    const page = createPaperPage(doc)
    const sourceGroups = groupLinesBySource(groupLines)

    let pendingListContainer: HTMLElement | null = null

    for (const sg of sourceGroups) {
      const el = renderSourceGroup(sg)
      if (sg.lines[0]!.kind === 'list-item') {
        // list-item 인 경우 부모 <ul>/<ol> 결정 (원본의 parentElement 유추)
        const liEl = sg.source
        const originalListTag = liEl.parentElement?.tagName.toLowerCase() === 'ol' ? 'ol' : 'ul'
        if (!pendingListContainer || pendingListContainer.tagName.toLowerCase() !== originalListTag) {
          pendingListContainer = doc.createElement(originalListTag)
          // attribute 복제 (className 등)
          if (liEl.parentElement) {
            for (const attr of Array.from(liEl.parentElement.attributes)) {
              if (attr.name === 'id') continue
              pendingListContainer.setAttribute(attr.name, attr.value)
            }
          }
          page.appendChild(pendingListContainer)
        }
        pendingListContainer.appendChild(el)
      } else {
        pendingListContainer = null
        page.appendChild(el)
      }
    }
    parent.appendChild(page)
  }
}

function renderSourceGroup(sg: SourceGroup): HTMLElement {
  const { source, lines } = sg
  // non-splittable 또는 charRange = -1 → source 그대로
  if (!lines[0]!.splittable || lines[0]!.charStart < 0) {
    return source.cloneNode(true) as HTMLElement
  }
  // splittable: source 의 charStart..lastLine.charEnd 영역 추출
  const startChar = lines[0]!.charStart
  const endChar = lines[lines.length - 1]!.charEnd
  return extractCharRange(source, startChar, endChar)
}

function extractCharRange(source: HTMLElement, startChar: number, endChar: number): HTMLElement {
  // source 의 clone 에서 0..startChar 와 endChar..end 를 제거
  const clone = source.cloneNode(true) as HTMLElement
  // tail 먼저 자르기 (endChar 위치)
  const totalLen = (clone.textContent ?? '').length
  if (endChar < totalLen) {
    splitElementAtCharIndex(clone, endChar)  // 후반부는 버림 (반환값 무시)
  }
  // head 자르기 (startChar 위치)
  if (startChar > 0) {
    const tail = splitElementAtCharIndex(clone, startChar)
    // tail 이 startChar 이후. clone 은 0..startChar (head). 우리가 원하는 건 tail.
    if (tail) return tail
  }
  return clone
}
```

- [ ] **Step 5: test 통과 확인**

```bash
cd viewer && npx vitest run src/lib/lineStream.test.ts
```

Expected: PASS (전체).

- [ ] **Step 6: Commit**

```bash
git add viewer/src/lib/lineStream.ts viewer/src/lib/lineStream.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): groupLinesBySource + renderLineGroups

groupLinesBySource: 연속 same source line 들을 묶음 (순수 함수).
renderLineGroups: Line[][] → paper-page DOM. source split 시 splitElementAtCharIndex 호출.
list-item 은 부모 <ul>/<ol> 새로 만들어서 wrap (attribute 복제).
TDD: 6 tests pass.
EOF
)"
```

---

## Task 5: `paginateVertical` 통합 — splitByHeight 폐기

**Files:**
- Modify: `viewer/src/lib/paginate.ts`
- Modify: `viewer/src/lib/paginate.test.ts`

- [ ] **Step 1: paginate.ts 의 paginateVertical 변경**

```ts
import { buildLineStream, renderLineGroups, splitByLineHeight } from './lineStream'
import { createPretextMeasurer } from './paragraphSplit'
// expandLargeParagraphs 는 더 이상 사용 X — import 제거

export function paginateVertical(
  content: HTMLElement,
  settings: ViewSettings
): void {
  const dims = PAGE_DIMS[settings.pageSize]
  const innerHeightPx = mmToPx(dims.h - settings.marginTop - settings.marginBottom)
  const innerWidthPx = mmToPx(dims.w - settings.marginLeft - settings.marginRight)
  if (innerHeightPx <= 0 || innerWidthPx <= 0) return

  const flat = Array.from(content.children) as HTMLElement[]
  if (flat.length === 0) return

  // measure 컨테이너 — paper-page 안에 children 임시 배치 → font/offsetHeight 측정
  const initialPage = createPaperPage()
  for (const child of flat) initialPage.appendChild(child)
  content.innerHTML = ''
  content.appendChild(initialPage)

  const lineStream = buildLineStream(
    flat,
    { innerWidthPx, innerHeightPx },
    createPretextMeasurer()
  )
  const lineGroups = splitByLineHeight(lineStream, innerHeightPx)
  renderLineGroups(content, lineGroups)
}
```

`splitByHeight` export 는 paginate.ts 에서 폐기 (다른 곳에서 import 안 함).

- [ ] **Step 2: paginate.test.ts 의 splitByHeight 테스트 폐기**

`splitByHeight` describe 블록 전체 삭제. mmToPx / clamp / round1 / paginateVertical 회귀 테스트만 유지.

- [ ] **Step 3: typecheck + 회귀 검사**

```bash
cd viewer && npm run typecheck && npm test
```

Expected: PASS. paginate.test.ts 의 splitByHeight 테스트 삭제됐으므로 test 수 감소.

- [ ] **Step 4: Commit**

```bash
git add viewer/src/lib/paginate.ts viewer/src/lib/paginate.test.ts
git commit -m "$(cat <<'EOF'
♻️ refactor(viewer): paginateVertical → line-단위 파이프라인

splitByHeight + expandLargeParagraphs 폐기. buildLineStream →
splitByLineHeight → renderLineGroups 3 단계 파이프라인 도입.

settings 변경 시 line 단위 즉시 반응. heading orphan 방지 활성.

splitByHeight 의 단위 테스트도 폐기 — line-단위 알고리즘 의 테스트는
lineStream.test.ts 에 있음.
EOF
)"
```

---

## Task 6: `paginateStrip` 통합

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
  const lineStream = buildLineStream(
    flat,
    { innerWidthPx, innerHeightPx: fit.innerHeight },
    createPretextMeasurer()
  )
  const lineGroups = splitByLineHeight(lineStream, fit.innerHeight)

  // strip 으로 다시 wrap
  content.innerHTML = ''
  const strip = document.createElement('div')
  strip.className = 'page-strip'
  // renderLineGroups 가 paper-page 들을 parent 에 append. 우리는 strip 으로 wrap 해야 함.
  // 임시 컨테이너에 render 후 paper-page 만 strip 으로 옮김.
  const tmp = document.createElement('div')
  renderLineGroups(tmp, lineGroups)
  for (const page of Array.from(tmp.children)) {
    if (page instanceof HTMLElement) applyFitDims(page, fit)
    strip.appendChild(page)
  }
  content.appendChild(strip)
  return { totalPages: lineGroups.length, fit, strip }
}
```

- [ ] **Step 2: 전체 테스트 + 빌드**

```bash
cd viewer && npm test && npm run typecheck && npm run build 2>&1 | tail -10
```

Expected: PASS. 빌드 OK.

- [ ] **Step 3: Commit**

```bash
git add viewer/src/lib/paginate.ts
git commit -m "$(cat <<'EOF'
♻️ refactor(viewer): paginateStrip → line-단위 파이프라인

horizontal / two-pages 도 동일 알고리즘. innerWidthPx/innerHeightPx 는
fit (viewport-scaled) 사용. renderLineGroups 결과 paper-page 들을
strip 으로 wrap + applyFitDims.
EOF
)"
```

---

## Task 7: window resize listener (useLayoutPagination)

**Files:**
- Modify: `viewer/src/hooks/useLayoutPagination.ts`

- [ ] **Step 1: resize listener 추가**

```ts
useEffect(() => {
  let timer: ReturnType<typeof setTimeout> | null = null
  const onResize = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      // EntryView 의 root element 를 어떻게 가져오는가?
      // → handleContentReady 가 callback 으로 받는 root 만 알고, 외부 ref 없음.
      // 해결: handleContentReady 안에서 root 를 ref 에 저장
      const root = lastRootRef.current
      if (root) {
        // re-paginate
        runPaginate(root)
      }
    }, 200)
  }
  window.addEventListener('resize', onResize)
  return () => {
    window.removeEventListener('resize', onResize)
    if (timer) clearTimeout(timer)
  }
}, [runPaginate])
```

전체 useLayoutPagination 재작성:

```ts
export function useLayoutPagination(
  settings: ViewSettings,
  onIndicator: (state: PageIndicatorState) => void
): { handleContentReady: (root: HTMLElement) => void } {
  const stripControllerRef = useRef<StripController | null>(null)
  const lastRootRef = useRef<HTMLElement | null>(null)

  const runPaginate = useCallback((root: HTMLElement) => {
    if (stripControllerRef.current) {
      stripControllerRef.current.destroy()
      stripControllerRef.current = null
    }
    unpaginate(root)

    if (settings.layout === 'vertical') {
      paginateVertical(root, settings)
      onIndicator({ visible: false, current: 0, total: 0, layout: settings.layout })
      return
    }
    if (settings.layout === 'horizontal' || settings.layout === 'two-pages') {
      const result = paginateStrip(root, settings, settings.layout)
      if (!result) {
        onIndicator({ visible: false, current: 0, total: 0, layout: settings.layout })
        return
      }
      const controller = new StripController(
        result.strip,
        settings.layout,
        result.totalPages,
        (current, total, layout) => onIndicator({ visible: true, current, total, layout })
      )
      stripControllerRef.current = controller
      return
    }
    onIndicator({ visible: false, current: 0, total: 0, layout: settings.layout })
  }, [settings, onIndicator])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const root = lastRootRef.current
        if (root) runPaginate(root)
      }, 200)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (timer) clearTimeout(timer)
    }
  }, [runPaginate])

  useEffect(() => {
    return () => {
      if (stripControllerRef.current) {
        stripControllerRef.current.destroy()
        stripControllerRef.current = null
      }
    }
  }, [])

  const handleContentReady = useCallback(
    (root: HTMLElement) => {
      lastRootRef.current = root
      runPaginate(root)
    },
    [runPaginate]
  )

  return { handleContentReady }
}
```

- [ ] **Step 2: 회귀 검사**

```bash
cd viewer && npm test && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add viewer/src/hooks/useLayoutPagination.ts
git commit -m "$(cat <<'EOF'
✨ feat(viewer): window resize listener (debounce 200ms)

resize 시 lastRootRef.current 사용해 paginate 만 다시 호출. markdown
재처리 X. settings 변경과 동일 흐름 (runPaginate 단일 진입점).

useLayoutPagination 의 logger.debug 제거 (line-stream 자체 진단 사용).
EOF
)"
```

---

## Task 8: paragraphSplit 의 폐기 함수 정리 + 테스트 정리

**Files:**
- Modify: `viewer/src/lib/paragraphSplit.ts` — expandLargeParagraphs / splitParagraph / readFontStyle / window 진단 코드 폐기. 재사용 helper 만 유지.
- Modify: `viewer/src/lib/paragraphSplit.test.ts` — 폐기되는 함수 테스트 제거

paragraphSplit.ts 의 유지/폐기:

| export | 운명 |
|---|---|
| `FontStyle`, `LineRange`, `MeasureResult`, `LineRangeMeasurer`, `SplitMetrics` | 유지 (lineStream 가 사용) |
| `SPLITTABLE_TAGS`, `MAX_SPLIT_RECURSION`, `SPLIT_HEIGHT_TOLERANCE_PX` | 폐기 (lineStream 의 자체 분류 사용) |
| `isSplittableElement` | 폐기 (lineStream 의 isInlineSplittable 으로 대체) |
| `pickSplitLine` | 폐기 (line-단위에서 불필요) |
| `splitElementAtCharIndex` | **유지** (renderLineGroups 가 사용) |
| `mapLineTextsToRanges`, `createPretextMeasurer`, `buildFontShorthand`, `toPretextWhiteSpace`, `toPretextWordBreak` | **유지** (lineStream 가 사용) |
| `splitParagraph`, `expandLargeParagraphs`, `readFontStyle`, `splitParagraphRec`, `ParagraphDiag`, `window.__notedropParagraphDiag` | **폐기** |

- [ ] **Step 1: paragraphSplit.ts 정리**

폐기되는 함수 / 타입 / 상수 / window global 모두 삭제.

- [ ] **Step 2: paragraphSplit.test.ts 정리**

폐기 함수의 테스트 (`splitParagraph`, `expandLargeParagraphs`, `pickSplitLine`, `isSplittableElement`) 삭제. 유지: `mapLineTextsToRanges`, `splitElementAtCharIndex` 의 단위 테스트.

- [ ] **Step 3: 전체 테스트 + 빌드**

```bash
cd viewer && npm test && npm run typecheck && npm run build 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add viewer/src/lib/paragraphSplit.ts viewer/src/lib/paragraphSplit.test.ts
git commit -m "$(cat <<'EOF'
🔥 remove(viewer): paragraphSplit 의 element-단위 함수 폐기

폐기: splitParagraph, expandLargeParagraphs, pickSplitLine, isSplittableElement,
splitParagraphRec, readFontStyle, ParagraphDiag (window global).

유지 (lineStream 가 재사용): FontStyle, LineRange, MeasureResult,
LineRangeMeasurer, splitElementAtCharIndex, mapLineTextsToRanges,
createPretextMeasurer.

paragraphSplit.test.ts 의 폐기 함수 테스트 정리.
EOF
)"
```

---

## Task 9: 5곳 version bump → v0.1.52

**Files:**
- Modify: manifest.json + plugin/package.json + plugin/package-lock.json + viewer/package.json + viewer/package-lock.json (모두 0.1.51 → 0.1.52)

- [ ] **Step 1: 5곳 version bump**

- [ ] **Step 2: Commit (release)**

```bash
git add manifest.json plugin/package.json plugin/package-lock.json viewer/package.json viewer/package-lock.json
git commit -m "$(cat <<'EOF'
🔖 release(v0.1.52): line-단위 paginate 알고리즘

paginate 1차 단위를 element 에서 line 으로 변경. settings 변경 시
element boundary 흡수 없이 line 단위 즉시 반응.

신규 모듈: viewer/src/lib/lineStream.ts
  - buildLineStream → splitByLineHeight → renderLineGroups 3 단계
  - heading orphan 방지 (heading + 다음 line 같은 page)
  - <li> 단위 분할 (depth 1)
  - 짧은 단락 measurer skip (offsetHeight ≤ lineHeight × 1.5)

폐기: paragraphSplit 의 element-단위 함수 + paginate 의 splitByHeight.
유지 (재사용): splitElementAtCharIndex, mapLineTextsToRanges, createPretextMeasurer.

신규: window resize listener (debounce 200ms) — resize 시 paginate 만
다시 호출 (markdown 재처리 X).

5곳 version 0.1.51 → 0.1.52.
EOF
)"
```

- [ ] **Step 3: push + workflow monitor**

```bash
git push origin main
gh run watch <id> --exit-status
```

Expected: ✓.

---

## Task 10: 핸드오프 + ADR

**Files:**
- Create: `docs/superpowers/handoffs/2026-04-27-line-by-line-paginate-completion.md`
- Create (선택): `docs/0028-line-based-paginate.md`

- [ ] **Step 1: 핸드오프 작성**

- [ ] **Step 2: ADR 0028 (선택)**

paginate 알고리즘 변경 + splitByHeight 폐기 사유 + 옵션 A/B/C 비교 + line 단위 결정.

- [ ] **Step 3: Commit + push**

```bash
git add docs/superpowers/handoffs/2026-04-27-line-by-line-paginate-completion.md docs/0028-line-based-paginate.md
git commit -m "📝 docs(handoff): line-단위 paginate 완료 핸드오프 + ADR 0028"
git push origin main
```

---

## Self-Review Checklist

- [ ] **Spec coverage** — spec 의 §1~§13 모두 task 매핑됐는가?
- [ ] **Placeholder scan** — 모든 task 의 코드 블록이 실제 구현. TBD 없음.
- [ ] **Type consistency** — `Line`, `LineKind`, `SourceGroup`, `LineStreamMetrics` 모두 첫 정의와 사용처 일치.
- [ ] **버전 bump** 누락 없음.
- [ ] **commit type/emoji** 컨벤션 준수.
