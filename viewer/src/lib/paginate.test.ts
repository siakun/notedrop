import { describe, expect, it } from 'vitest'
import type { PageSize, ViewSettings } from '@/types/viewSettings'
import { clamp, computePageFit, mmToPx, round1 } from './paginate'

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

describe('computePageFit', () => {
  it('keeps viewport-fit margins equal across page sizes', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1536
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 961
    })
    document.documentElement.style.setProperty('--header-height', '56px')

    const baseSettings: ViewSettings = {
      theme: 'night',
      layout: 'horizontal',
      pageSize: 'A4',
      marginTop: 20,
      marginBottom: 20,
      marginLeft: 25,
      marginRight: 25,
      font: 'system',
      fontScale: 1,
      lineScale: 1,
      align: 'left'
    }
    const sizes: PageSize[] = ['Auto', 'B4', 'A4', 'B5', 'A5']

    for (const pageSize of sizes) {
      const fit = computePageFit(
        { ...baseSettings, pageSize },
        'horizontal'
      )

      expect(fit).not.toBeNull()
      expect(fit!.padTop).toBeCloseTo(mmToPx(20), 5)
      expect(fit!.padBottom).toBeCloseTo(mmToPx(20), 5)
      expect(fit!.padLeft).toBeCloseTo(mmToPx(25), 5)
      expect(fit!.padRight).toBeCloseTo(mmToPx(25), 5)
    }
  })
})
