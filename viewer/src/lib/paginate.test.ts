import { describe, expect, it } from 'vitest'
import { clamp, mmToPx, round1 } from './paginate'

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

// paginateVertical 단위 테스트는 v0.1.59 에서 폐기 — paginateVertical 함수 자체
// 폐기 (PaginatedView 컴포넌트가 대체). computeLayout 의 단위 테스트는 향후 추가
// (DOM mock + measurer 주입).
