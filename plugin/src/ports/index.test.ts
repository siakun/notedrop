import { describe, it, expectTypeOf } from 'vitest'
import type { VaultFs, MetaCache, GitClient, GitAuth } from './index.js'

describe('ports barrel', () => {
  it('VaultFs exposes async file ops', () => {
    expectTypeOf<VaultFs['readFile']>().returns.resolves.toBeString()
    expectTypeOf<VaultFs['fileExists']>().returns.resolves.toBeBoolean()
  })

  it('MetaCache.on returns an unsubscribe function', () => {
    expectTypeOf<MetaCache['on']>().returns.toMatchTypeOf<() => void>()
  })

  it('GitClient.push takes auth', () => {
    expectTypeOf<GitClient['push']>().parameters.toEqualTypeOf<[string, GitAuth]>()
  })
})
