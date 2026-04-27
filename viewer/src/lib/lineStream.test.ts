import { describe, expect, it } from 'vitest'
import { splitByLineHeight } from './lineStream'
import type { Line } from './lineStream'

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
    const lines = Array.from({ length: 6 }, () => L({}))  // 6 × 20 = 120
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
