import type { ReactNode } from 'react'
import Callout from '@/components/markdown/Callout'
import MermaidBlock from '@/components/markdown/MermaidBlock'
import DeadLink from '@/components/markdown/DeadLink'
import EmbedPlaceholder, { EmbedOverflow } from '@/components/markdown/EmbedPlaceholder'

type GenericProps = {
  className?: string
  children?: ReactNode
  [key: string]: unknown
}

function classList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v))
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean)
  return []
}

export const reactComponents = {
  div(props: GenericProps) {
    const classes = classList(props.className)
    if (classes.includes('callout')) {
      return (
        <Callout
          className={classes.join(' ')}
          data-callout-title={typeof props['data-callout-title'] === 'string' ? props['data-callout-title'] : ''}
          data-callout-fold={typeof props['data-callout-fold'] === 'string' ? props['data-callout-fold'] : undefined}
        >
          {props.children}
        </Callout>
      )
    }
    if (classes.includes('notedrop-embed-placeholder')) {
      return <EmbedPlaceholder>{props.children}</EmbedPlaceholder>
    }
    if (classes.includes('notedrop-embed-overflow')) {
      return <EmbedOverflow>{props.children}</EmbedOverflow>
    }
    return <div {...(props as Record<string, unknown>)}>{props.children}</div>
  },
  pre(props: GenericProps) {
    const classes = classList(props.className)
    if (classes.includes('mermaid')) {
      const source = typeof props['data-source'] === 'string' ? (props['data-source'] as string) : undefined
      return <MermaidBlock source={source}>{props.children}</MermaidBlock>
    }
    return <pre {...(props as Record<string, unknown>)}>{props.children}</pre>
  },
  span(props: GenericProps) {
    const classes = classList(props.className)
    if (classes.includes('notedrop-deadlink')) {
      return <DeadLink>{props.children}</DeadLink>
    }
    return <span {...(props as Record<string, unknown>)}>{props.children}</span>
  }
}
