'use client'

import { useEffect, useRef, useState } from 'react'

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null

async function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
        fontFamily: 'inherit'
      })
      return mermaid
    })
  }
  return mermaidPromise
}

let counter = 0

export type MermaidBlockProps = {
  source?: string
  children?: React.ReactNode
}

export default function MermaidBlock({ source, children }: MermaidBlockProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const code = source ?? extractText(children)

  useEffect(() => {
    let cancelled = false
    if (!ref.current) return
    const id = `notedrop-mermaid-${++counter}`
    loadMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then(({ svg, bindFunctions }) => {
        if (cancelled || !ref.current) return
        ref.current.innerHTML = svg
        if (bindFunctions) bindFunctions(ref.current)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <pre className="mermaid mermaid-error" data-source={code}>
        {`mermaid 렌더 오류: ${error}\n\n${code}`}
      </pre>
    )
  }

  return <div ref={ref} className="mermaid mermaid-rendered" />
}

function extractText(children: React.ReactNode): string {
  if (!children) return ''
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(extractText).join('')
  if (typeof children === 'object' && children !== null && 'props' in children) {
    const props = (children as { props?: { children?: React.ReactNode } }).props
    return extractText(props?.children)
  }
  return ''
}
