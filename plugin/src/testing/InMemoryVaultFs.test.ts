import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryVaultFs } from './InMemoryVaultFs.js'

describe('InMemoryVaultFs', () => {
  let vault: InMemoryVaultFs

  beforeEach(() => {
    vault = new InMemoryVaultFs({
      '/notes/a.md': '# A',
      '/notes/b.md': '# B',
      '/notes/sub/c.md': '# C',
      '/img/cover.png': 'PNGBYTES'
    })
  })

  it('readFile returns stored text content', async () => {
    expect(await vault.readFile('/notes/a.md')).toBe('# A')
  })

  it('readFile rejects on missing path', async () => {
    await expect(vault.readFile('/missing.md')).rejects.toThrow(/not found/i)
  })

  it('readBinary returns Uint8Array of UTF-8 bytes', async () => {
    const bytes = await vault.readBinary('/img/cover.png')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(bytes)).toBe('PNGBYTES')
  })

  it('writeFile inserts new path', async () => {
    await vault.writeFile('/new.md', 'hello')
    expect(await vault.readFile('/new.md')).toBe('hello')
  })

  it('writeFile overwrites existing path', async () => {
    await vault.writeFile('/notes/a.md', '# A2')
    expect(await vault.readFile('/notes/a.md')).toBe('# A2')
  })

  it('fileExists is true for stored, false otherwise', async () => {
    expect(await vault.fileExists('/notes/a.md')).toBe(true)
    expect(await vault.fileExists('/missing.md')).toBe(false)
  })

  it('listFiles returns immediate children of folder, not recursive', async () => {
    const files = await vault.listFiles('/notes')
    expect(files.sort()).toEqual(['/notes/a.md', '/notes/b.md'])
  })

  it('listFiles returns empty array for unknown folder', async () => {
    expect(await vault.listFiles('/nope')).toEqual([])
  })

  it('listAllFiles returns every stored path', async () => {
    expect((await vault.listAllFiles()).sort()).toEqual([
      '/img/cover.png',
      '/notes/a.md',
      '/notes/b.md',
      '/notes/sub/c.md'
    ])
  })

  it('searchByName matches basename across vault', async () => {
    expect((await vault.searchByName('c.md')).sort()).toEqual(['/notes/sub/c.md'])
  })

  it('searchByName returns multiple matches', async () => {
    await vault.writeFile('/other/c.md', 'dup')
    expect((await vault.searchByName('c.md')).sort()).toEqual([
      '/notes/sub/c.md',
      '/other/c.md'
    ])
  })

  it('searchByName returns empty array for no matches', async () => {
    expect(await vault.searchByName('nothing.md')).toEqual([])
  })
})
