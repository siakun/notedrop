import { describe, expect, it } from 'vitest'
import { clamp, mmToPx, paginateVertical, round1 } from './paginate'
import { VS_DEFAULTS } from '@/types/viewSettings'

describe('mmToPx', () => {
  it('mm → px 변환 (96 DPI)', () => {
    expect(mmToPx(25.4)).toBe(96)
    expect(mmToPx(0)).toBe(0)
  })
})

describe('clamp', () => {
  it('범위 안은 그대로', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })
  it('하한 미만은 lo', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })
  it('상한 초과는 hi', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })
})

describe('round1', () => {
  it('소수 1자리 반올림', () => {
    expect(round1(1.234)).toBe(1.2)
    expect(round1(1.55)).toBe(1.6)
  })
})

describe('paginateVertical (회귀)', () => {
  // jsdom 에서 pretext canvas 부재 → buildLineStream 의 measurer throw →
  // element 단위 1 line fallback. 짧은 단락은 short-paragraph gate (offsetHeight
  // ≤ lineHeight×1.5) 통과 → measure skip + 1 line.

  it('짧은 단락 1개 → 단일 paper-page 1개', () => {
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

  it('빈 content → no-op', () => {
    const content = document.createElement('div')
    document.body.appendChild(content)
    paginateVertical(content, { ...VS_DEFAULTS, layout: 'vertical', pageSize: 'A4' })
    expect(content.children.length).toBe(0)
    document.body.removeChild(content)
  })
})
