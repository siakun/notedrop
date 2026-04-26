import { describe, expect, it, vi } from 'vitest'
import { Resource } from './resource'

describe('Resource<T>', () => {
  it('cache hit 시 fetcher 안 부름', async () => {
    const fetcher = vi.fn(async (key: string) => `value-${key}`)
    const resource = new Resource<string>(fetcher)
    expect(await resource.get('a')).toBe('value-a')
    expect(await resource.get('a')).toBe('value-a')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('force=true 시 cache 우회', async () => {
    const fetcher = vi.fn(async (key: string) => `value-${key}`)
    const resource = new Resource<string>(fetcher)
    await resource.get('a')
    await resource.get('a', true)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('동시 호출 dedup — 같은 promise 반환', async () => {
    const fetcher = vi.fn(async (key: string) => {
      await new Promise((r) => setTimeout(r, 10))
      return `value-${key}`
    })
    const resource = new Resource<string>(fetcher)
    const [a, b] = await Promise.all([resource.get('x'), resource.get('x')])
    expect(a).toBe('value-x')
    expect(b).toBe('value-x')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('invalidate 후 다음 get 이 fetcher 다시 부름', async () => {
    const fetcher = vi.fn(async (key: string) => `value-${key}`)
    const resource = new Resource<string>(fetcher)
    await resource.get('a')
    resource.invalidate('a')
    await resource.get('a')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('subscribe 가 invalidate 시 callback 호출', async () => {
    const fetcher = async (key: string): Promise<string> => `value-${key}`
    const resource = new Resource<string>(fetcher)
    await resource.get('a')
    const callback = vi.fn()
    resource.subscribe(callback)
    resource.invalidate('a')
    expect(callback).toHaveBeenCalledWith('a')
  })

  it('subscribe unsubscribe', async () => {
    const fetcher = async (key: string): Promise<string> => `value-${key}`
    const resource = new Resource<string>(fetcher)
    await resource.get('a')
    const callback = vi.fn()
    const unsub = resource.subscribe(callback)
    unsub()
    resource.invalidate('a')
    expect(callback).not.toHaveBeenCalled()
  })

  it('peek 이 cache 의 동기 read', async () => {
    const fetcher = async (key: string): Promise<string> => `value-${key}`
    const resource = new Resource<string>(fetcher)
    expect(resource.peek('a')).toBe(null)
    await resource.get('a')
    expect(resource.peek('a')).toBe('value-a')
  })

  it('invalidateAll 이 모든 key 의 callback 호출', async () => {
    const fetcher = async (key: string): Promise<string> => `value-${key}`
    const resource = new Resource<string>(fetcher)
    await resource.get('a')
    await resource.get('b')
    const callback = vi.fn()
    resource.subscribe(callback)
    resource.invalidateAll()
    expect(callback).toHaveBeenCalledWith('a')
    expect(callback).toHaveBeenCalledWith('b')
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('fetcher 가 throw 하면 inflight 에서 제거 (다음 get 이 retry)', async () => {
    let attempt = 0
    const fetcher = vi.fn(async (key: string) => {
      attempt++
      if (attempt === 1) throw new Error('first fail')
      return `value-${key}`
    })
    const resource = new Resource<string>(fetcher)
    await expect(resource.get('a')).rejects.toThrow('first fail')
    expect(await resource.get('a')).toBe('value-a')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
