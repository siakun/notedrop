import { describe, it, expect } from 'vitest'
import { deriveShareUrlBase, resolveShareUrlBase } from './shareUrl.js'
import { DEFAULT_SETTINGS } from './PluginSettings.js'

describe('deriveShareUrlBase', () => {
  it('owner/repo → owner.github.io/repo', () => {
    expect(deriveShareUrlBase('siakun/notedrop-share')).toBe('https://siakun.github.io/notedrop-share')
  })

  it('user 페이지 repo (owner/owner.github.io) → 루트', () => {
    expect(deriveShareUrlBase('siakun/siakun.github.io')).toBe('https://siakun.github.io')
  })

  it('대소문자 구분 없이 user 페이지 인식', () => {
    expect(deriveShareUrlBase('Siakun/siakun.github.io')).toBe('https://Siakun.github.io')
    expect(deriveShareUrlBase('siakun/Siakun.github.io')).toBe('https://siakun.github.io')
  })

  it('빈 문자열 → 빈 문자열', () => {
    expect(deriveShareUrlBase('')).toBe('')
  })

  it('형식 잘못 → 빈 문자열', () => {
    expect(deriveShareUrlBase('invalid')).toBe('')
    expect(deriveShareUrlBase('a/b/c')).toBe('')
    expect(deriveShareUrlBase('/repo')).toBe('')
    expect(deriveShareUrlBase('owner/')).toBe('')
  })

  it('공백 trim', () => {
    expect(deriveShareUrlBase(' siakun / repo ')).toBe('https://siakun.github.io/repo')
  })
})

describe('resolveShareUrlBase', () => {
  it('explicit shareUrlBase 우선', () => {
    expect(resolveShareUrlBase({
      ...DEFAULT_SETTINGS,
      targetRepo: 'siakun/notedrop-share',
      shareUrlBase: 'https://blog.example.com'
    })).toBe('https://blog.example.com')
  })

  it('explicit 비면 targetRepo 기반 도출', () => {
    expect(resolveShareUrlBase({
      ...DEFAULT_SETTINGS,
      targetRepo: 'siakun/notedrop-share',
      shareUrlBase: ''
    })).toBe('https://siakun.github.io/notedrop-share')
  })

  it('explicit 끝 슬래시 strip', () => {
    expect(resolveShareUrlBase({
      ...DEFAULT_SETTINGS,
      targetRepo: 'siakun/notedrop-share',
      shareUrlBase: 'https://blog.example.com/'
    })).toBe('https://blog.example.com')
  })

  it('둘 다 비어있으면 빈 문자열', () => {
    expect(resolveShareUrlBase({
      ...DEFAULT_SETTINGS,
      targetRepo: '',
      shareUrlBase: ''
    })).toBe('')
  })
})
