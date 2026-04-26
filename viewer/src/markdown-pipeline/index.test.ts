import { describe, expect, it } from 'vitest'
import { buildProcessor } from './index'

async function render(input: string): Promise<string> {
  const processor = buildProcessor()
  const file = await processor.process(input)
  return String(file)
}

describe('markdown-pipeline integration', () => {
  it('표준 markdown 렌더', async () => {
    const html = await render('# Hello\n\n**bold**')
    expect(html).toContain('<h1>Hello</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('GFM 표 렌더', async () => {
    const html = await render('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>a</th>')
  })

  it('callout > [!info] 변환', async () => {
    const html = await render('> [!info] My Title\n> Body line')
    expect(html).toContain('class="callout callout-info"')
    expect(html).toContain('data-callout-title="My Title"')
    expect(html).toContain('Body line')
  })

  it('callout 의 alias (note → note, summary → abstract) 정규화', async () => {
    const html1 = await render('> [!summary] X\n> body')
    expect(html1).toContain('class="callout callout-abstract"')
    const html2 = await render('> [!warning] X\n> body')
    expect(html2).toContain('class="callout callout-warning"')
  })

  it('callout 의 default title — type 만 있고 title 없음', async () => {
    const html = await render('> [!warning]\n> body')
    expect(html).toContain('data-callout-title="경고"')
  })

  it('==text== highlight 변환', async () => {
    const html = await render('this is ==important== text')
    expect(html).toContain('<mark>important</mark>')
  })

  it('mermaid 코드블록 → pre.mermaid + data-source', async () => {
    const html = await render('```mermaid\ngraph TD\n  A --> B\n```')
    expect(html).toContain('class="mermaid"')
    expect(html).toContain('data-source')
  })

  it('일반 코드블록 (mermaid 아님) 은 그대로', async () => {
    const html = await render('```js\nconst x = 1\n```')
    expect(html).toContain('<pre>')
    expect(html).not.toContain('class="mermaid"')
  })

  it('HTML 패스스루 — ContentTransformer 가 만든 dead-link span 보존', async () => {
    const input = 'see <span class="notedrop-deadlink">Private</span> ref'
    const html = await render(input)
    expect(html).toContain('class="notedrop-deadlink"')
    expect(html).toContain('Private')
  })

  it('callout body 안의 markdown 자동 변환', async () => {
    const html = await render('> [!info] Test\n> **bold** in body')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('callout 비활성 시 일반 blockquote 으로 폴백', async () => {
    const processor = buildProcessor({ callout: false })
    const file = await processor.process('> [!info] X\n> body')
    const html = String(file)
    expect(html).toContain('<blockquote>')
    expect(html).not.toContain('class="callout"')
  })

  it('mermaid 비활성 시 코드블록 그대로', async () => {
    const processor = buildProcessor({ mermaid: false })
    const file = await processor.process('```mermaid\nA --> B\n```')
    const html = String(file)
    expect(html).not.toContain('class="mermaid"')
    expect(html).toContain('<code class="language-mermaid">')
  })
})
