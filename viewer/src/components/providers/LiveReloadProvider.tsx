'use client'

import { useEffect } from 'react'
import { invalidateAllContent, invalidateContent } from '@/lib/contentClient'
import { invalidateManifest } from '@/lib/manifestClient'
import { useLiveStatus, useSetLiveStatus } from '@/stores/viewerStore'

function isPreviewHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0'
}

export default function LiveBadge() {
  const status = useLiveStatus()
  const setStatus = useSetLiveStatus()

  useEffect(() => {
    if (!isPreviewHost()) return

    let cancelled = false
    let backoff = 500
    let timer: ReturnType<typeof setTimeout> | null = null
    let es: EventSource | null = null
    let reloadPending = false
    let reloadRunning = false

    const flash = () => {
      setStatus('updated')
      setTimeout(() => {
        if (!cancelled) setStatus('connected')
      }, 800)
    }

    const runReload = async (hash: string | null) => {
      if (reloadRunning) {
        reloadPending = true
        return
      }
      reloadRunning = true
      try {
        do {
          reloadPending = false
          invalidateManifest()
          if (hash) invalidateContent(hash)
          else invalidateAllContent()
          flash()
        } while (reloadPending)
      } finally {
        reloadRunning = false
      }
    }

    const open = () => {
      if (cancelled) return
      try {
        es = new EventSource('events')
      } catch {
        setStatus('reconnecting')
        return
      }
      es.addEventListener('hello', () => {
        backoff = 500
        setStatus('connected')
      })
      const handler = (e: MessageEvent) => {
        let hash: string | null = null
        try {
          const data = JSON.parse(e.data) as { hash?: string }
          hash = data.hash ?? null
        } catch {}
        void runReload(hash)
      }
      es.addEventListener('added', handler as EventListener)
      es.addEventListener('changed', handler as EventListener)
      es.addEventListener('removed', handler as EventListener)
      es.onerror = () => {
        if (es) {
          es.close()
          es = null
        }
        if (cancelled) return
        setStatus('reconnecting')
        timer = setTimeout(open, backoff)
        backoff = Math.min(backoff * 2, 5000)
      }
    }

    open()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (es) es.close()
    }
  }, [setStatus])

  if (status === 'idle') return null
  return (
    <div
      className={`live-badge live-badge-${status}`}
      role="status"
      aria-live="polite"
    >
      {status === 'connected' && 'LIVE'}
      {status === 'updated' && 'updated'}
      {status === 'reconnecting' && 'reconnecting…'}
    </div>
  )
}
