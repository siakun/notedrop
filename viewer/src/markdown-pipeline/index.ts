import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import remarkCallout from './remark-callout'
import remarkHighlight from './remark-highlight'
import remarkMermaid from './remark-mermaid'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkCallout)
  .use(remarkHighlight)
  .use(remarkMermaid)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeKatex)
  .use(rehypeStringify, { allowDangerousHtml: true })

export async function renderMarkdownToHtml(body: string): Promise<string> {
  const file = await processor.process(body)
  return String(file)
}

export function fixAssetPaths(html: string, hash: string): string {
  // ContentTransformer 가 만든 절대 경로 /content/<hash>/_assets/foo.png 를
  // GH Pages basePath /notedrop 또는 PreviewServer 의 / 어느 쪽에서도 작동하도록 상대화.
  void hash
  return html.replace(/(src|href)="\/content\//g, '$1="content/')
}
