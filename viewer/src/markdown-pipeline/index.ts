import { unified, type Processor } from 'unified'
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

export type ProcessorOptions = {
  /** false 면 callout (`> [!info] ...`) plugin 비활성. 기본 true. */
  callout?: boolean
  /** false 면 highlight (==text==) plugin 비활성. 기본 true. */
  highlight?: boolean
  /** false 면 mermaid (\`\`\`mermaid ...) plugin 비활성. 기본 true. */
  mermaid?: boolean
}

/**
 * unified pipeline 을 옵션 주입 가능한 factory 로. 단위 테스트가 옵션 다르게
 * (예: callout 만 검증) 호출 가능. runtime 은 default 옵션 (모두 활성).
 *
 * unified 의 Processor generic 이 plugin 추가마다 mdast/hast 단계 transition
 * 으로 변경되어 conditional `.use()` 가 strict type 으로 표현 어려움. 본 함수
 * 는 unknown 캐스팅으로 단순화 — 단위 테스트로 동작 검증 의무.
 */
export function buildProcessor(opts: ProcessorOptions = {}): Processor {
  const useCallout = opts.callout !== false
  const useHighlight = opts.highlight !== false
  const useMermaid = opts.mermaid !== false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let p: any = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
  if (useCallout) p = p.use(remarkCallout)
  if (useHighlight) p = p.use(remarkHighlight)
  if (useMermaid) p = p.use(remarkMermaid)
  return p
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeKatex)
    .use(rehypeStringify, { allowDangerousHtml: true }) as Processor
}

let defaultProcessor: Processor | null = null
function getDefaultProcessor(): Processor {
  if (!defaultProcessor) defaultProcessor = buildProcessor()
  return defaultProcessor
}

export async function renderMarkdownToHtml(body: string): Promise<string> {
  const file = await getDefaultProcessor().process(body)
  return String(file)
}

export function fixAssetPaths(html: string, hash: string): string {
  // ContentTransformer 가 만든 절대 경로 /content/<hash>/_assets/foo.png 를
  // GH Pages basePath 또는 PreviewServer 의 / 어느 쪽에서도 작동하도록 상대화.
  void hash
  return html.replace(/(src|href)="\/content\//g, '$1="content/')
}
