import { describe, it, expect, vi } from 'vitest'
import { AssetCollector } from './AssetCollector.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import type { Reference } from './types.js'

const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function imageRef(target: string, vaultPath: string, mime = 'image/png'): Reference {
  return {
    type: 'image',
    rawText: `![[${target}]]`,
    target,
    resolution: { kind: 'image', vaultPath, mime }
  }
}

describe('AssetCollector.findRefs', () => {
  it('returns empty for no refs', async () => {
    const vault = new InMemoryVaultFs({})
    const c = new AssetCollector(vault)
    expect(await c.findRefs([], HASH)).toEqual([])
  })

  it('skips non-image refs', async () => {
    const vault = new InMemoryVaultFs({})
    const c = new AssetCollector(vault)
    const refs: Reference[] = [{
      type: 'wikilink',
      rawText: '[[X]]',
      target: 'X',
      resolution: { kind: 'unpublished-note', noteName: 'X' }
    }]
    expect(await c.findRefs(refs, HASH)).toEqual([])
  })

  it('builds AssetRef with outputPath under hash dir', async () => {
    const vault = new InMemoryVaultFs({ '/img/c.png': 'PNGBYTES' })
    const c = new AssetCollector(vault)
    const refs = [imageRef('c.png', '/img/c.png')]
    expect(await c.findRefs(refs, HASH)).toEqual([{
      vaultPath: '/img/c.png',
      outputPath: `/content/${HASH}/_assets/c.png`,
      size: 'PNGBYTES'.length,
      mime: 'image/png'
    }])
  })

  it('deduplicates same outputPath across refs', async () => {
    const vault = new InMemoryVaultFs({ '/img/c.png': 'X' })
    const c = new AssetCollector(vault)
    const refs = [imageRef('c.png', '/img/c.png'), imageRef('c.png', '/img/c.png')]
    const out = await c.findRefs(refs, HASH)
    expect(out).toHaveLength(1)
  })

  it('skips broken image refs', async () => {
    const vault = new InMemoryVaultFs({})
    const c = new AssetCollector(vault)
    const broken: Reference = {
      type: 'image',
      rawText: '![[m.png]]',
      target: 'm.png',
      resolution: { kind: 'broken', reason: 'not found' }
    }
    expect(await c.findRefs([broken], HASH)).toEqual([])
  })
})

describe('AssetCollector.copy', () => {
  it('reads vaultPath and calls writer with outputPath + bytes for each', async () => {
    const vault = new InMemoryVaultFs({ '/x.png': 'X', '/y.png': 'YY' })
    const c = new AssetCollector(vault)
    const writer = vi.fn().mockResolvedValue(undefined)
    await c.copy(
      [
        { vaultPath: '/x.png', outputPath: '/out/x.png', size: 1, mime: 'image/png' },
        { vaultPath: '/y.png', outputPath: '/out/y.png', size: 2, mime: 'image/png' }
      ],
      writer
    )
    expect(writer).toHaveBeenCalledTimes(2)
    expect(writer.mock.calls[0]![0]).toBe('/out/x.png')
    expect(writer.mock.calls[1]![0]).toBe('/out/y.png')
  })

  it('propagates writer rejections', async () => {
    const vault = new InMemoryVaultFs({ '/x.png': 'X' })
    const c = new AssetCollector(vault)
    const writer = vi.fn().mockRejectedValue(new Error('disk full'))
    await expect(
      c.copy(
        [{ vaultPath: '/x.png', outputPath: '/o/x.png', size: 1, mime: 'image/png' }],
        writer
      )
    ).rejects.toThrow('disk full')
  })

  it('rejects when source vault path missing', async () => {
    const vault = new InMemoryVaultFs({})
    const c = new AssetCollector(vault)
    const writer = vi.fn()
    await expect(
      c.copy(
        [{ vaultPath: '/missing.png', outputPath: '/o/missing.png', size: 1, mime: 'image/png' }],
        writer
      )
    ).rejects.toThrow(/not found/)
    expect(writer).not.toHaveBeenCalled()
  })
})
