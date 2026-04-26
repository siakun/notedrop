import { describe, expect, it } from 'vitest'
import { resolveRoute } from './router'
import type { ManifestItem } from '@/types/manifest'

const items: ManifestItem[] = [
  {
    hash: 'book-1',
    slug: 'my-book',
    title: 'My Book',
    cover: null,
    render: 'book',
    type: 'entry',
    parent: null,
    order: null,
    chapters: ['ch-1', 'ch-2'],
    updatedAt: ''
  },
  {
    hash: 'ch-1',
    slug: null,
    title: 'Chapter 1',
    cover: null,
    render: 'book',
    type: 'chapter',
    parent: 'book-1',
    order: 1,
    chapters: null,
    updatedAt: ''
  },
  {
    hash: 'ch-2',
    slug: null,
    title: 'Chapter 2',
    cover: null,
    render: 'book',
    type: 'chapter',
    parent: 'book-1',
    order: 2,
    chapters: null,
    updatedAt: ''
  },
  {
    hash: 'doc-1',
    slug: null,
    title: 'Solo Doc',
    cover: null,
    render: 'doc',
    type: 'entry',
    parent: null,
    order: null,
    chapters: null,
    updatedAt: ''
  }
]

describe('resolveRoute', () => {
  it('home route → null', () => {
    expect(resolveRoute({ kind: 'home' }, items)).toBe(null)
  })

  it('빈 manifest → null', () => {
    expect(resolveRoute({ kind: 'entry', hash: 'x' }, [])).toBe(null)
  })

  it('hash 직접 매치', () => {
    const r = resolveRoute({ kind: 'entry', hash: 'doc-1' }, items)
    expect(r?.entry.hash).toBe('doc-1')
    expect(r?.chapter).toBe(null)
    expect(r?.chapters).toEqual([])
  })

  it('slug 매치 (hash 없을 때 fallback)', () => {
    const r = resolveRoute({ kind: 'entry', hash: 'my-book' }, items)
    expect(r?.entry.hash).toBe('book-1')
  })

  it('chapter hash → 부모 book 으로 redirect + chapter 활성', () => {
    const r = resolveRoute({ kind: 'entry', hash: 'ch-2' }, items)
    expect(r?.entry.hash).toBe('book-1')
    expect(r?.chapter?.hash).toBe('ch-2')
    expect(r?.chapters.map((c) => c.hash)).toEqual(['ch-1', 'ch-2'])
  })

  it('book entry 는 chapters 배열 채워짐', () => {
    const r = resolveRoute({ kind: 'entry', hash: 'book-1' }, items)
    expect(r?.entry.hash).toBe('book-1')
    expect(r?.chapter).toBe(null)
    expect(r?.chapters.map((c) => c.hash)).toEqual(['ch-1', 'ch-2'])
  })

  it('doc entry 는 chapters 빈 배열', () => {
    const r = resolveRoute({ kind: 'entry', hash: 'doc-1' }, items)
    expect(r?.chapters).toEqual([])
  })

  it('crumb 가 chapter 면 "book / chapter"', () => {
    const r = resolveRoute({ kind: 'entry', hash: 'ch-1' }, items)
    expect(r?.crumb).toBe('My Book / Chapter 1')
  })

  it('crumb 가 entry 만 이면 entry title', () => {
    const r = resolveRoute({ kind: 'entry', hash: 'book-1' }, items)
    expect(r?.crumb).toBe('My Book')
  })

  it('찾을 수 없는 hash → null', () => {
    expect(resolveRoute({ kind: 'entry', hash: 'unknown' }, items)).toBe(null)
  })

  it('orphan chapter (parent 없음) → 자체 entry 처리', () => {
    const orphan: ManifestItem[] = [
      {
        hash: 'orphan',
        slug: null,
        title: 'Orphan',
        cover: null,
        render: 'doc',
        type: 'chapter',
        parent: 'missing-book',
        order: null,
        chapters: null,
        updatedAt: ''
      }
    ]
    const r = resolveRoute({ kind: 'entry', hash: 'orphan' }, orphan)
    expect(r?.entry.hash).toBe('orphan')
    expect(r?.chapter).toBe(null)
  })
})
