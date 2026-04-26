import { describe, expect, it } from 'vitest'
import { withBase, NOTEDROP_BASE_PLACEHOLDER } from './basePath'

describe('withBase', () => {
  it('절대 path 에 placeholder prefix 등록', () => {
    expect(withBase('/icons/foo.svg')).toBe(`${NOTEDROP_BASE_PLACEHOLDER}/icons/foo.svg`)
  })

  it('상대 path 는 그대로', () => {
    expect(withBase('icons/foo.svg')).toBe('icons/foo.svg')
    expect(withBase('./icons/foo.svg')).toBe('./icons/foo.svg')
  })

  it('이미 placeholder 적용된 path 는 중복 방지 — 그대로 반환', () => {
    const already = `${NOTEDROP_BASE_PLACEHOLDER}/icons/foo.svg`
    expect(withBase(already)).toBe(already)
  })

  it('외부 URL (http://) 은 그대로', () => {
    expect(withBase('https://example.com/foo.svg')).toBe('https://example.com/foo.svg')
  })

  it('빈 문자열은 그대로', () => {
    expect(withBase('')).toBe('')
  })
})
