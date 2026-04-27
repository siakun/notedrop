import { describe, expect, it } from 'vitest'
import {
  mapLineTextsToRanges,
  splitElementAtCharIndex
} from './paragraphSplit'

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
