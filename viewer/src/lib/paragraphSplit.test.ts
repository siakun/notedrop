import { describe, expect, it } from 'vitest'
import {
  isSplittableElement,
  pickSplitLine,
  splitElementAtCharIndex
} from './paragraphSplit'
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

  it('className 과 data-* / aria-* attribute 복제', () => {
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
