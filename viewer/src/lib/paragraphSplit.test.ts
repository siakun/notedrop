import { describe, expect, it } from 'vitest'
import {
  expandLargeParagraphs,
  isSplittableElement,
  mapLineTextsToRanges,
  pickSplitLine,
  splitElementAtCharIndex,
  splitParagraph
} from './paragraphSplit'
import type { LineRangeMeasurer, MeasureResult, SplitMetrics } from './paragraphSplit'

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

  it('빈 lineTexts → 빈 결과', () => {
    expect(mapLineTextsToRanges('foo', [])).toEqual([])
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
    p.textContent = 'short text'  // 10 chars / 2 per line = 5 lines × 20 = 100
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
    const stuck: LineRangeMeasurer = (text) => ({
      lineHeight: 100,
      lines: text.split('').map((_, i) => ({ startIdx: i, endIdx: i + 1 }))
    })
    const result = splitParagraph(p, { innerWidthPx: 500, innerHeightPx: 50 }, stuck)
    expect(result.length).toBeLessThanOrEqual(1000)
  })
})

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
    // p1: 5 lines × 20 = 100. innerHeight=40 → 2 lines/페이지. 3 단락 (4/4/2).
    // p2: 5 chars / 2 per line = 3 lines × 20 = 60. innerHeight=40 → 분할.
    //   원본 5 chars → 4/1 (2 단락).
    const result = expandLargeParagraphs(
      parent,
      [p1, p2],
      { innerWidthPx: 500, innerHeightPx: 40 },
      m
    )

    expect(result.length).toBe(5)  // p1 → 3, p2 → 2
    expect(parent.children.length).toBe(5)
    expect(parent.children[0]!.textContent).toBe('ABCD')
    expect(parent.children[1]!.textContent).toBe('EFGH')
    expect(parent.children[2]!.textContent).toBe('IJ')
    expect(parent.children[3]!.textContent).toBe('shor')
    expect(parent.children[4]!.textContent).toBe('t')
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
