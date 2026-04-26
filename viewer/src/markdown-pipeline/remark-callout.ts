import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import { defaultCalloutTitle, normalizeCalloutType } from './callout-types'

const HEADER_RE = /^\[!([\w-]+)\]([+-])?\s*(.*)$/

type Node = {
  type: string
  value?: string
  children?: Node[]
  data?: Record<string, unknown>
}

const remarkCallout: Plugin = function () {
  return (tree) => {
    visit(tree as Node, 'blockquote', (node: Node) => {
      const children = node.children ?? []
      const first = children[0]
      if (!first || first.type !== 'paragraph') return
      const firstChildren = first.children ?? []
      const text = firstChildren[0]
      if (!text || text.type !== 'text' || typeof text.value !== 'string') return
      const lines = text.value.split('\n')
      const headerLine = lines[0] ?? ''
      const m = HEADER_RE.exec(headerLine)
      if (!m) return
      const variant = normalizeCalloutType(m[1] ?? '')
      const fold = m[2] ?? ''
      const title = (m[3] ?? '').trim() || defaultCalloutTitle(variant)
      const remainder = lines.slice(1).join('\n')
      if (remainder) {
        text.value = remainder
      } else {
        firstChildren.shift()
        if (firstChildren.length === 0) {
          children.shift()
        }
      }
      node.data = node.data ?? {}
      ;(node.data as Record<string, unknown>).hName = 'div'
      ;(node.data as Record<string, unknown>).hProperties = {
        className: ['callout', `callout-${variant}`],
        'data-callout-title': title,
        'data-callout-fold': fold || undefined
      }
    })
  }
}

export default remarkCallout
