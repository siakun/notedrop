'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { invalidateAllContent, invalidateContent } from '@/lib/contentClient'
import { invalidateManifest } from '@/lib/manifestClient'

type ReloadStatus = 'idle' | 'connected' | 'updated' | 'disconnected'

export default function LiveReloadProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ReloadStatus>('idle')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const host = window.location.hostname
    const isLocal = host === 'localhost' || host === '127.0.0.1'
    if (!isLocal) return

    let sse: EventSource | null = null
    let cancelled = false
    try {
      sse = new EventSource('/events')
      sse.addEventListener('hello', () => setStatus('connected'))
      sse.addEventListener('changed', (e: MessageEvent) => {
        try {
          const { hash } = JSON.parse(e.data) as { hash: string }
          invalidateManifest()
          if (hash) invalidateContent(hash)
          else invalidateAllContent()
          setStatus('updated')
          setTimeout(() => {
            if (!cancelled) setStatus('connected')
          }, 1500)
        } catch {}
      })
      sse.addEventListener('removed', (e: MessageEvent) => {
        try {
          const { hash } = JSON.parse(e.data) as { hash: string }
          invalidateManifest()
          if (hash) invalidateContent(hash)
          setStatus('updated')
          setTimeout(() => {
            if (!cancelled) setStatus('connected')
          }, 1500)
        } catch {}
      })
      sse.onerror = () => setStatus('disconnected')
    } catch {
      setStatus('disconnected')
    }

    return () => {
      cancelled = true
      if (sse) sse.close()
    }
  }, [])

  return (
    <>
      {children}
      {status !== 'idle' && (
        <div className={`notedrop-live-badge notedrop-live-${status}`} aria-live="polite">
          {status === 'connected' && 'LIVE'}
          {status === 'updated' && '갱신됨'}
          {status === 'disconnected' && '연결 끊김'}
        </div>
      )}
    </>
  )
}
