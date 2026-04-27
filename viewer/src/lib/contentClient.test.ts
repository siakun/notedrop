import { describe, expect, it } from 'vitest'
import { parsePageMarkdown } from './contentClient'

describe('parsePageMarkdown', () => {
  it('frontmatter 파싱 + body 분리', () => {
    const raw = `---
hash: abc-123
slug: my-note
title: My Note
render: doc
type: entry
parent: null
order: null
cover: null
customCss: null
publishedAt: 2026-01-01T00:00:00Z
updatedAt: 2026-01-02T00:00:00Z
---

# Hello

Body content.`
    const { frontmatter, body } = parsePageMarkdown(raw)
    expect(frontmatter.hash).toBe('abc-123')
    expect(frontmatter.slug).toBe('my-note')
    expect(frontmatter.title).toBe('My Note')
    expect(frontmatter.render).toBe('doc')
    expect(frontmatter.type).toBe('entry')
    expect(frontmatter.parent).toBe(null)
    expect(frontmatter.cover).toBe(null)
    expect(body.trim()).toBe('# Hello\n\nBody content.')
  })

  it('frontmatter 없으면 default + raw 그대로', () => {
    const raw = '# Just markdown\n\nNo frontmatter.'
    const { frontmatter, body } = parsePageMarkdown(raw)
    expect(frontmatter.hash).toBe('')
    expect(frontmatter.title).toBe('')
    expect(body).toBe(raw)
  })

  it('render = book / type = chapter 매핑', () => {
    const raw = `---
hash: x
title: Book
render: book
type: chapter
---

body`
    const { frontmatter } = parsePageMarkdown(raw)
    expect(frontmatter.render).toBe('book')
    expect(frontmatter.type).toBe('chapter')
  })

  it('잘못된 render 값은 doc 폴백', () => {
    const raw = `---
hash: x
render: invalid
---

body`
    const { frontmatter } = parsePageMarkdown(raw)
    expect(frontmatter.render).toBe('doc')
  })

  it('quoted string 값 파싱 (JSON.stringify 등록한 한글·특수문자)', () => {
    const raw = `---
hash: x
title: "자기소개서 - .NET 백엔드"
---

body`
    const { frontmatter } = parsePageMarkdown(raw)
    expect(frontmatter.title).toBe('자기소개서 - .NET 백엔드')
  })

  it('order = 숫자', () => {
    const raw = `---
hash: x
order: 3
---

body`
    const { frontmatter } = parsePageMarkdown(raw)
    expect(frontmatter.order).toBe(3)
  })

  it('frontmatter 안에 적어도 한 줄 있을 때만 처리 (production 보장 가정)', () => {
    // production 의 ContentTransformer 는 항상 PageFrontmatter 의 11 필드를
    // 직렬화하므로 빈 frontmatter case 는 발생 X. 본 parser 는 단순 — close
    // fence 검색 위치가 fence.length 부터라 빈 frontmatter 는 close 미발견 →
    // raw 전체 body 반환. production 영향 없음.
    const raw = '---\nhash: x\n---\n\nbody'
    const { frontmatter, body } = parsePageMarkdown(raw)
    expect(frontmatter.hash).toBe('x')
    expect(body).toBe('body')
  })
})
