import { describe, expect, it } from 'vitest'
import {
  buildLineStream,
  groupLinesBySource,
  splitByLineHeight
} from './lineStream'
import type { Line, LineRangeMeasurer } from './lineStream'

function L(opts: Partial<Line>): Line {
  return {
    source: document.createElement('p'),
    charStart: 0,
    charEnd: 10,
    height: 20,
    marginTop: 0,
    marginBottom: 0,
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
    const lines = Array.from({ length: 6 }, () => L({}))  // 6 × 20 = 120
    const groups = splitByLineHeight(lines, 100)
    expect(groups.length).toBe(2)
    expect(groups[0]!.length).toBe(5)  // 5 × 20 = 100
    expect(groups[1]!.length).toBe(1)
  })

  it('source 간 collapsed vertical margin 을 포함해 page overflow 를 막는다', () => {
    const p1 = document.createElement('p')
    const p2 = document.createElement('p')
    const lines = [
      L({ source: p1, height: 50, marginBottom: 12 }),
      L({ source: p2, height: 40, marginTop: 12 })
    ]
    // content height 만 보면 90px 이라 1 page 로 보이지만, 실제 DOM 은
    // sibling margin collapse 후 50 + 12 + 40 = 102px 이다.
    const groups = splitByLineHeight(lines, 100)
    expect(groups.length).toBe(2)
    expect(groups[0]).toEqual([lines[0]])
    expect(groups[1]).toEqual([lines[1]])
  })

  it('같은 source 가 page fragment 로 렌더링될 때 top/bottom margin 을 포함한다', () => {
    const p = document.createElement('p')
    const lines = [
      L({ source: p, height: 25, marginTop: 10, marginBottom: 10 }),
      L({ source: p, height: 25, marginTop: 10, marginBottom: 10 }),
      L({ source: p, height: 25, marginTop: 10, marginBottom: 10 })
    ]
    // 한 page 에 3줄을 넣으면 <p> fragment 의 margin 포함 높이는
    // 10 + 25 + 25 + 25 + 10 = 95px 이라 80px page 를 넘는다.
    const groups = splitByLineHeight(lines, 80)
    expect(groups.length).toBe(2)
    expect(groups[0]).toEqual([lines[0], lines[1]])
    expect(groups[1]).toEqual([lines[2]])
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

  it('heading orphan 방지 — heading 이 group 마지막에 단독 → 다음 group 으로', () => {
    const heading = L({ height: 30, breakAfterAvoid: true, kind: 'heading' })
    const para = L({ height: 80 })
    // heading(30) + para(80) = 110 > 100. 단순 split: [heading], [para]. 그런데
    // heading 만 있는 group 0 가 의미 없음 → heading 이 다음 group 의 시작이 되도록.
    const groups = splitByLineHeight([heading, para], 100)
    // heading 이 다음 group 으로 이동 → 첫 group 비고 두번째 group 에 heading+para
    // 또는 단순 [heading], [para] — orphan 방지 안 함. 본 테스트의 기대:
    // heading 이 단독으로 첫 group 에 가지 않도록.
    // 현실: heading 이 마지막인 group 만들기 직전에 다음 line 이 안 들어가면 push 회피.
    // → 결과: heading 을 다음 group 으로 옮김. 단 *기존* line 들이 있어야 함.
    // 본 케이스는 첫 line 이 heading — 첫 group 비우면 안 됨. 그대로 push.
    // 즉: [[heading], [para]] — orphan 방지 *불가* (첫 group 비우면 안 됨).
    expect(groups.length).toBe(2)
    expect(groups[0]![0]).toBe(heading)
    expect(groups[1]![0]).toBe(para)
  })

  it('heading orphan 방지 (limit 안에 들어갈 때만 작동) — 이전 line 50 + heading 30 + 60: heading + 60 ≤ 100 → orphan 방지', () => {
    const lines: Line[] = [
      L({ height: 50 }),
      L({ height: 30, breakAfterAvoid: true, kind: 'heading' }),
      L({ height: 60 })
    ]
    // group 0 채움: 50+30=80. 다음 60 안 들어감 (80+60=140>100).
    // orphan 방지: heading+60 = 90 ≤ 100 → 같이 다음 group 으로.
    // → [[50], [heading, 60]]
    const groups = splitByLineHeight(lines, 100)
    expect(groups.length).toBe(2)
    expect(groups[0]!.length).toBe(1)
    expect(groups[1]!.length).toBe(2)
    expect(groups[1]![0]).toBe(lines[1])
  })

  it('heading orphan 방지 비활성 (combined 가 limit 초과) — heading 30 + next 80 > 100 → 그대로 orphan', () => {
    const lines: Line[] = [
      L({ height: 50 }),
      L({ height: 30, breakAfterAvoid: true, kind: 'heading' }),
      L({ height: 80 })
    ]
    // heading + 80 = 110 > 100 → orphan 방지 비활성. [[50, heading], [80]]
    const groups = splitByLineHeight(lines, 100)
    expect(groups.length).toBe(2)
    expect(groups[0]!.length).toBe(2)
    expect(groups[1]!.length).toBe(1)
  })

  it('heading 이 *전체 마지막* line 이면 그대로 push', () => {
    const heading = L({ height: 30, breakAfterAvoid: true, kind: 'heading' })
    const first = L({ height: 50 })
    const groups = splitByLineHeight([first, heading], 100)
    expect(groups.length).toBe(1)
    expect(groups[0]!.length).toBe(2)
  })
})

function fakeMeasurer(perLineChars: number, lineHeight: number): LineRangeMeasurer {
  return (text) => {
    const lines = []
    for (let i = 0; i < text.length; i += perLineChars) {
      lines.push({ startIdx: i, endIdx: Math.min(i + perLineChars, text.length) })
    }
    return { lineHeight, lines }
  }
}

function setupParent(htmlList: string[]): HTMLElement {
  const parent = document.createElement('section')
  for (const html of htmlList) {
    parent.insertAdjacentHTML('beforeend', html)
  }
  document.body.appendChild(parent)
  return parent
}

describe('buildLineStream', () => {
  it('<p> 분할 — measurer 결과 N line', () => {
    const parent = setupParent(['<p>ABCDEFGHIJ</p>'])  // 10 chars
    const p = parent.firstElementChild as HTMLElement
    // jsdom 의 offsetHeight = 0 → short-paragraph gate 통과 — measure skip.
    // 강제로 offsetHeight 설정해 measure trigger.
    Object.defineProperty(p, 'offsetHeight', { value: 200, configurable: true })
    const m = fakeMeasurer(2, 20)
    const lines = buildLineStream([p], { innerWidthPx: 500, innerHeightPx: 100 }, m)
    expect(lines.length).toBe(5)
    expect(lines[0]!.charStart).toBe(0)
    expect(lines[0]!.charEnd).toBe(2)
    expect(lines[0]!.kind).toBe('paragraph')
    expect(lines[0]!.height).toBe(20)
    expect(lines[0]!.splittable).toBe(true)
    document.body.removeChild(parent)
  })

  it('computed vertical margin 을 각 source line 에 보존한다', () => {
    const parent = setupParent([
      '<p style="margin-top: 12px; margin-bottom: 8px;">ABCDEFGHIJ</p>'
    ])
    const p = parent.firstElementChild as HTMLElement
    Object.defineProperty(p, 'offsetHeight', { value: 200, configurable: true })
    const lines = buildLineStream(
      [p],
      { innerWidthPx: 500, innerHeightPx: 100 },
      fakeMeasurer(2, 20)
    )
    expect(lines.length).toBe(5)
    expect(lines.every((line) => line.marginTop === 12)).toBe(true)
    expect(lines.every((line) => line.marginBottom === 8)).toBe(true)
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

  it('unit element (pre/table/img) 는 line 1 개', () => {
    const parent = setupParent([
      '<pre>code</pre>',
      '<table><tr><td>x</td></tr></table>',
      '<img src="x">'
    ])
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
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines[0]!.kind).toBe('list-item')
    document.body.removeChild(parent)
  })

  it('짧은 <p> (offsetHeight 0 in jsdom) → measurer skip, line 1개', () => {
    const parent = setupParent(['<p>x</p>'])
    const p = parent.firstElementChild as HTMLElement
    let measureCallCount = 0
    const m: LineRangeMeasurer = (text, style, w) => {
      measureCallCount++
      return fakeMeasurer(2, 20)(text, style, w)
    }
    const lines = buildLineStream([p], { innerWidthPx: 500, innerHeightPx: 100 }, m)
    expect(measureCallCount).toBe(0)
    expect(lines.length).toBe(1)
    expect(lines[0]!.splittable).toBe(false)
    document.body.removeChild(parent)
  })

  it('measurer throw 시 element 단위 line 1 개 fallback', () => {
    const parent = setupParent(['<p>긴 단락 ' + 'x'.repeat(500) + '</p>'])
    const p = parent.firstElementChild as HTMLElement
    Object.defineProperty(p, 'offsetHeight', { value: 1000, configurable: true })
    const failing: LineRangeMeasurer = () => {
      throw new Error('canvas unavailable')
    }
    const lines = buildLineStream([p], { innerWidthPx: 500, innerHeightPx: 100 }, failing)
    expect(lines.length).toBe(1)
    expect(lines[0]!.splittable).toBe(false)
    document.body.removeChild(parent)
  })

  it('빈 <p> (텍스트 없음) — line 1 개', () => {
    const parent = setupParent(['<p></p>'])
    const p = parent.firstElementChild as HTMLElement
    const m = fakeMeasurer(2, 20)
    const lines = buildLineStream([p], { innerWidthPx: 500, innerHeightPx: 100 }, m)
    expect(lines.length).toBe(1)
    document.body.removeChild(parent)
  })
})

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

// renderLineGroups 의 단위 테스트는 v0.1.59 에서 폐기 — PaperPage 컴포넌트가
// 대체. 컴포넌트 단위 테스트는 향후 추가 (jsdom + React testing-library).
