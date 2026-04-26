import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

type Node = {
  type: string
  value?: string
  lang?: string | null
  meta?: string | null
  data?: Record<string, unknown>
  children?: Node[]
}

const remarkMermaid: Plugin = function () {
  return (tree) => {
    visit(tree as Node, 'code', (node: Node) => {
      if (node.lang !== 'mermaid') return
      const source = node.value ?? ''
      node.data = node.data ?? {}
      ;(node.data as Record<string, unknown>).hName = 'pre'
      ;(node.data as Record<string, unknown>).hProperties = {
        className: ['mermaid'],
        'data-source': source
      }
      ;(node.data as Record<string, unknown>).hChildren = [
        { type: 'text', value: source }
      ]
    })
  }
}

export default remarkMermaid
