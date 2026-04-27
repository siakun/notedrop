import { describe, expect, it } from 'vitest'
import { clamp, mmToPx, paginateVertical, round1, splitByHeight } from './paginate'
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

describe('splitByHeight', () => {
  it('한계 안에 다 들어가면 1 group', () => {
    const heights = [10, 20, 30]
    const groups = splitByHeight(heights, 100)
    expect(groups).toEqual([[0, 1, 2]])
  })

  it('한계 초과 시 새 group 시작', () => {
    const heights = [40, 40, 40]
    const groups = splitByHeight(heights, 100)
    // 0+40=40, 40+40=80, 80+40=120 > 100 → 새 group
    expect(groups).toEqual([[0, 1], [2]])
  })

  it('단일 element 가 한계 초과해도 그 group 에 등록 (보존)', () => {
    const heights = [200, 50]
    const groups = splitByHeight(heights, 100)
    // first group 빈 채로 0 추가 (overflow). 50 은 다음 group.
    expect(groups).toEqual([[0], [1]])
  })

  it('빈 array 면 빈 group 1개', () => {
    expect(splitByHeight([], 100)).toEqual([[]])
  })

  it('정확히 한계와 같으면 같은 group', () => {
    const heights = [50, 50]
    const groups = splitByHeight(heights, 100)
    expect(groups).toEqual([[0, 1]])
  })
})

describe('paginateVertical (회귀)', () => {
  // jsdom 에서 pretext canvas 부재 → measurer throw → splitParagraph fallback.
  // 따라서 expandLargeParagraphs 가 통합돼도 짧은 단락은 기존과 동일 동작.

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
