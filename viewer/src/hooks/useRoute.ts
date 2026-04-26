'use client'

import { useEffect, useState } from 'react'
import { logger } from '@/lib/logger'

export type Route = { kind: 'home' } | { kind: 'entry'; hash: string }

function parseHashRoute(): Route {
  if (typeof window === 'undefined') return { kind: 'home' }
  const raw = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '').trim()
  if (!raw) return { kind: 'home' }
  return { kind: 'entry', hash: raw }
}

/**
 * URL hash fragment 기반 라우팅. `#/<hash>/` → entry, 빈 hash → home.
 * hashchange 이벤트 구독 + render token 자동 증가 (race condition 방어용).
 *
 * Race condition: SSE 라이브 리로드 중 사용자 클릭 hashchange 가 동시 발생.
 * 옛 render 가 새 entry 를 덮어씀 방지 — token 매 변경 시 ++ 해서 후처리
 * 단계가 token 비교로 stale 자기 무효화.
 */
export function useRoute(): { route: Route; renderToken: number; mounted: boolean } {
  const [route, setRoute] = useState<Route>({ kind: 'home' })
  const [renderToken, setRenderToken] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const initial = parseHashRoute()
    setRoute(initial)
    setRenderToken((t) => t + 1)
    logger.debug('route', 'initial route', { route: initial })

    const onHash = (): void => {
      const next = parseHashRoute()
      setRoute(next)
      setRenderToken((t) => t + 1)
      logger.debug('route', 'hashchange', { route: next })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return { route, renderToken, mounted }
}
