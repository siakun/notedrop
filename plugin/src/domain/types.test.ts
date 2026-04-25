import { describe, it, expectTypeOf } from 'vitest'
import type {
  PublishedItem,
  Reference,
  ResolvedContent,
  TransformedContent,
  AssetRef,
  ChapterPlan,
  ReferenceResolution
} from './types.js'

describe('domain types', () => {
  it('PublishedItem has filePath (internal-only field)', () => {
    expectTypeOf<PublishedItem['filePath']>().toBeString()
  })

  it('PublishedItem.customCssRaw separates inline and file', () => {
    expectTypeOf<PublishedItem['customCssRaw']>().toEqualTypeOf<{
      inline: string | null
      file: string | null
    }>()
  })

  it('Reference resolution is a discriminated union of 4 kinds', () => {
    type Kinds = ReferenceResolution['kind']
    expectTypeOf<Kinds>().toEqualTypeOf<
      'published-note' | 'unpublished-note' | 'image' | 'broken'
    >()
  })

  it('ResolvedContent carries refs and raw markdown', () => {
    expectTypeOf<ResolvedContent['rawMarkdown']>().toBeString()
    expectTypeOf<ResolvedContent['refs']>().toEqualTypeOf<Reference[]>()
  })

  it('TransformedContent carries warnings', () => {
    expectTypeOf<TransformedContent['warnings']>().toEqualTypeOf<string[]>()
  })

  it('AssetRef has size and mime', () => {
    expectTypeOf<AssetRef['size']>().toBeNumber()
    expectTypeOf<AssetRef['mime']>().toBeString()
  })

  it('ChapterPlan source is one of three fallback labels', () => {
    expectTypeOf<ChapterPlan['source']>().toEqualTypeOf<
      'waypoint' | 'moc' | 'folder-scan'
    >()
  })
})
