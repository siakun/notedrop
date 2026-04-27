import { describe, expect, it } from 'vitest'
import { isSplittableElement, pickSplitLine } from './paragraphSplit'
import type { MeasureResult } from './paragraphSplit'

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

  it('inner height 가 한 줄도 못 들어갈 만큼 작으면 lines[0].endIdx (최소 1줄)', () => {
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
