import { describe, it, expectTypeOf } from 'vitest'
import type { Manifest, ManifestItem, PageFrontmatter } from './types.js'

describe('public output types', () => {
  it('Manifest.items is ManifestItem[]', () => {
    expectTypeOf<Manifest['items']>().toEqualTypeOf<ManifestItem[]>()
  })

  it('PageFrontmatter and ManifestItem share identifying fields', () => {
    expectTypeOf<PageFrontmatter['hash']>().toBeString()
    expectTypeOf<ManifestItem['hash']>().toBeString()
    expectTypeOf<PageFrontmatter['render']>().toEqualTypeOf<ManifestItem['render']>()
    expectTypeOf<PageFrontmatter['type']>().toEqualTypeOf<ManifestItem['type']>()
  })

  it('Manifest version is the literal 1', () => {
    expectTypeOf<Manifest['version']>().toEqualTypeOf<1>()
  })
})
