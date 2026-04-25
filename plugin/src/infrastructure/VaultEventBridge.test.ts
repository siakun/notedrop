import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { VaultEventBridge } from './VaultEventBridge.js'
import { PublishIndex } from '../domain/PublishIndex.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

describe('VaultEventBridge', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache
  let index: PublishIndex
  let bridge: VaultEventBridge

  beforeEach(() => {
    vi.useFakeTimers()
    vault = new InMemoryVaultFs({
      'a.md': '# A',
      'b.md': '# B'
    })
    meta = new FakeMetaCache({
      'a.md': { frontmatter: { 'notedrop-publish': true } },
      'b.md': { frontmatter: { 'notedrop-publish': true } }
    })
    index = new PublishIndex(vault, meta)
    bridge = new VaultEventBridge(meta, index, { debounceMs: 200 })
    bridge.start()
  })

  afterEach(() => {
    bridge.stop()
    vi.useRealTimers()
  })

  it('changed 이벤트로 upsert 호출', () => {
    meta.fire('changed', 'a.md')
    expect(index.getByPath('a.md')).toBeNull()
    vi.advanceTimersByTime(200)
    expect(index.getByPath('a.md')).not.toBeNull()
  })

  it('200ms 안에 연속 changed 가 오면 한 번만 upsert', () => {
    const spy = vi.spyOn(index, 'upsert')
    meta.fire('changed', 'a.md')
    vi.advanceTimersByTime(50)
    meta.fire('changed', 'a.md')
    vi.advanceTimersByTime(50)
    meta.fire('changed', 'a.md')
    vi.advanceTimersByTime(200)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('a.md')
  })

  it('서로 다른 path 는 독립적으로 디바운스', () => {
    const spy = vi.spyOn(index, 'upsert')
    meta.fire('changed', 'a.md')
    meta.fire('changed', 'b.md')
    vi.advanceTimersByTime(200)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('deleted 이벤트로 remove 호출', () => {
    meta.fire('changed', 'a.md')
    vi.advanceTimersByTime(200)
    expect(index.getByPath('a.md')).not.toBeNull()
    meta.fire('deleted', 'a.md')
    vi.advanceTimersByTime(200)
    expect(index.getByPath('a.md')).toBeNull()
  })

  it('renamed 이벤트로 rename 호출', () => {
    meta.fire('changed', 'a.md')
    vi.advanceTimersByTime(200)
    const before = index.getByPath('a.md')!
    meta.seed('renamed.md', { frontmatter: { 'notedrop-publish': true } })
    meta.fire('renamed', 'renamed.md', 'a.md')
    vi.advanceTimersByTime(200)
    expect(index.getByPath('a.md')).toBeNull()
    const after = index.getByPath('renamed.md')!
    expect(after).not.toBeNull()
    expect(after.hash).toBe(before.hash)
  })

  it('renamed 가 oldPath 없으면 무시', () => {
    const spy = vi.spyOn(index, 'rename')
    meta.fire('renamed', 'x.md')
    vi.advanceTimersByTime(200)
    expect(spy).not.toHaveBeenCalled()
  })

  it('stop 이후에는 이벤트 무시', () => {
    const spy = vi.spyOn(index, 'upsert')
    bridge.stop()
    meta.fire('changed', 'a.md')
    vi.advanceTimersByTime(200)
    expect(spy).not.toHaveBeenCalled()
  })

  it('stop 은 보류된 타이머 정리', () => {
    const spy = vi.spyOn(index, 'upsert')
    meta.fire('changed', 'a.md')
    bridge.stop()
    vi.advanceTimersByTime(200)
    expect(spy).not.toHaveBeenCalled()
  })

  it('flushAll 로 즉시 처리', () => {
    const spy = vi.spyOn(index, 'upsert')
    meta.fire('changed', 'a.md')
    meta.fire('changed', 'b.md')
    bridge.flushAll()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('start 두 번 호출해도 구독 한 번만', () => {
    const spy = vi.spyOn(index, 'upsert')
    bridge.start()
    meta.fire('changed', 'a.md')
    vi.advanceTimersByTime(200)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
