import { describe, it, expect } from 'vitest'
import { deriveShareUrlBase, resolveShareUrlBase } from './shareUrl.js'
import { DEFAULT_SETTINGS } from './PluginSettings.js'

describe('deriveShareUrlBase', () => {
  it('owner/repo → owner.github.io/repo', () => {
    expect(deriveShareUrlBase('username/notedrop-share')).toBe('https://username.github.io/notedrop-share')
  })

  it('user 페이지 repo (owner/owner.github.io) → 루트', () => {
    expect(deriveShareUrlBase('username/username.github.io')).toBe('https://username.github.io')
  })

  it('대소문자 구분 없이 user 페이지 인식', () => {
    expect(deriveShareUrlBase('Username/username.github.io')).toBe('https://Username.github.io')
    expect(deriveShareUrlBase('username/Username.github.io')).toBe('https://username.github.io')
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
    expect(deriveShareUrlBase(' username / repo ')).toBe('https://username.github.io/repo')
  })
})

describe('resolveShareUrlBase', () => {
  it('targetRepo 기반 자동 도출', () => {
    expect(resolveShareUrlBase({
      ...DEFAULT_SETTINGS,
      targetRepo: 'username/notedrop-share'
    })).toBe('https://username.github.io/notedrop-share')
  })

  it('targetRepo 비어있으면 빈 문자열', () => {
    expect(resolveShareUrlBase({
      ...DEFAULT_SETTINGS,
      targetRepo: ''
    })).toBe('')
  })
})
