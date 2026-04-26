import type { ReactNode } from 'react'

export type CalloutProps = {
  className?: string
  children?: ReactNode
  'data-callout-title'?: string
  'data-callout-fold'?: string
}

const ICONS: Record<string, string> = {
  'callout-info': 'ⓘ',
  'callout-note': '✎',
  'callout-abstract': '☰',
  'callout-todo': '☐',
  'callout-tip': '💡',
  'callout-success': '✓',
  'callout-question': '?',
  'callout-warning': '⚠',
  'callout-failure': '✕',
  'callout-danger': '⚡',
  'callout-bug': '🐛',
  'callout-example': '✱',
  'callout-quote': '❝'
}

export default function Callout(props: CalloutProps) {
  const className = props.className ?? 'callout callout-note'
  const title = props['data-callout-title'] ?? ''
  const fold = props['data-callout-fold']
  const variantKey = className
    .split(/\s+/)
    .find((c) => c.startsWith('callout-')) ?? 'callout-note'
  const icon = ICONS[variantKey] ?? '•'

  if (fold === '-') {
    return (
      <details className={className}>
        <summary className="callout-title">
          <span className="callout-icon" aria-hidden="true">{icon}</span>
          <span className="callout-title-text">{title}</span>
        </summary>
        <div className="callout-body">{props.children}</div>
      </details>
    )
  }

  return (
    <div className={className}>
      <div className="callout-title">
        <span className="callout-icon" aria-hidden="true">{icon}</span>
        <span className="callout-title-text">{title}</span>
      </div>
      <div className="callout-body">{props.children}</div>
    </div>
  )
}
