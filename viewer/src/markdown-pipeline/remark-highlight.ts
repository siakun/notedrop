import type { Plugin } from 'unified'
import { SKIP, visit } from 'unist-util-visit'

const HIGHLIGHT_RE = /==([^=\n]+)==/g

type Node = {
  type: string
  value?: string
  children?: Node[]
  data?: Record<string, unknown>
}

const remarkHighlight: Plugin = function () {
  return (tree) => {
    visit(tree as Node, 'text', (node: Node, index, parent) => {
      if (!parent || typeof index !== 'number') return
      const value = node.value
      if (typeof value !== 'string' || !value.includes('==')) return
      HIGHLIGHT_RE.lastIndex = 0
      const replacements: Node[] = []
      let last = 0
      let m: RegExpExecArray | null
      let matched = false
      while ((m = HIGHLIGHT_RE.exec(value)) !== null) {
        matched = true
        if (m.index > last) {
          replacements.push({ type: 'text', value: value.slice(last, m.index) })
        }
        const inner = m[1] ?? ''
        replacements.push({
          type: 'mark',
          children: [{ type: 'text', value: inner }],
          data: {
            hName: 'mark',
            hProperties: {}
          }
        } as Node)
        last = m.index + m[0].length
      }
      if (!matched) return
      if (last < value.length) {
        replacements.push({ type: 'text', value: value.slice(last) })
      }
      const parentChildren = (parent as Node).children ?? []
      parentChildren.splice(index, 1, ...replacements)
      return [SKIP, index + replacements.length]
    })
  }
}

export default remarkHighlight
