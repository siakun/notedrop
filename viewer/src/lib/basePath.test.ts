import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withBase, NOTEDROP_BASE_PLACEHOLDER } from './basePath'

describe('withBase — production', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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

describe('withBase — dev/test', () => {
  // NODE_ENV stub 안 함 — vitest default ('test'). 즉 production 아님.

  it('dev/test 에서는 절대 path 도 placeholder 미부착 (Next dev 가 public 직접 서빙)', () => {
    expect(withBase('/icons/foo.svg')).toBe('/icons/foo.svg')
  })

  it('dev/test 에서도 이미 placeholder 적용된 path 는 그대로', () => {
    const already = `${NOTEDROP_BASE_PLACEHOLDER}/icons/foo.svg`
    expect(withBase(already)).toBe(already)
  })

  it('dev/test 에서도 외부 URL 그대로', () => {
    expect(withBase('https://example.com/foo.svg')).toBe('https://example.com/foo.svg')
  })
})
