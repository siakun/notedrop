import { unified, type Processor } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeReact from 'rehype-react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import remarkCallout from './remark-callout'
import remarkHighlight from './remark-highlight'
import remarkMermaid from './remark-mermaid'
import { reactComponents } from './react-components'

let processor: Processor | null = null

function buildProcessor(): Processor {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkCallout)
    .use(remarkHighlight)
    .use(remarkMermaid)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeKatex)
    .use(rehypeReact, {
      Fragment,
      jsx,
      jsxs,
      components: reactComponents
    } as Parameters<typeof rehypeReact>[0]) as unknown as Processor
}

export function getProcessor(): Processor {
  if (!processor) processor = buildProcessor()
  return processor
}

export async function renderMarkdown(body: string): Promise<unknown> {
  const file = await getProcessor().process(body)
  return file.result
}
