'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  paginateStrip,
  paginateVertical,
  unpaginate
} from '@/lib/paginate'
import { StripController } from '@/lib/stripController'
import { logger } from '@/lib/logger'
import type { ViewSettings } from '@/types/viewSettings'
import type { PageIndicatorState } from '@/components/layout/PageIndicator'

const RESIZE_DEBOUNCE_MS = 200

/**
 * Markdown 렌더 완료 후 layout 모드별 페이지네이션 + PageIndicator 상태 갱신.
 * line-단위 paginate 알고리즘 (lib/lineStream.ts) 사용.
 *
 * Layout 별 동작:
 *  - default: 페이지네이션 X. indicator 숨김.
 *  - vertical: paginateVertical (paper-page 분리). indicator 숨김.
 *  - horizontal/two-pages: paginateStrip + StripController (가상 가로 스크롤).
 *    indicator 표시.
 *
 * window resize listener (debounce 200ms): viewport 변경 시 markdown 재처리 X,
 * paginate 만 다시 호출 (lastRootRef 사용). settings 변경 흐름과 동일 진입점
 * (runPaginate) — 일관된 cleanup + paginate 재실행.
 *
 * StripController 인스턴스는 ref 보관, layout 변경/unmount 시 자동 destroy.
 */
export function useLayoutPagination(
  settings: ViewSettings,
  onIndicator: (state: PageIndicatorState) => void
): { handleContentReady: (root: HTMLElement) => void } {
  const stripControllerRef = useRef<StripController | null>(null)
  const lastRootRef = useRef<HTMLElement | null>(null)

  const runPaginate = useCallback(
    (root: HTMLElement) => {
      if (stripControllerRef.current) {
        stripControllerRef.current.destroy()
        stripControllerRef.current = null
      }
      unpaginate(root)

      if (settings.layout === 'vertical') {
        paginateVertical(root, settings)
        onIndicator({ visible: false, current: 0, total: 0, layout: settings.layout })
        logger.debug('paginate', 'vertical 적용', {
          pageSize: settings.pageSize
        })
        return
      }

      if (settings.layout === 'horizontal' || settings.layout === 'two-pages') {
        const result = paginateStrip(root, settings, settings.layout)
        if (!result) {
          onIndicator({ visible: false, current: 0, total: 0, layout: settings.layout })
          logger.warn('paginate', 'paginateStrip 실패 (computePageFit null)')
          return
        }
        const controller = new StripController(
          result.strip,
          settings.layout,
          result.totalPages,
          (current, total, layout) =>
            onIndicator({ visible: true, current, total, layout })
        )
        stripControllerRef.current = controller
        logger.debug('paginate', `${settings.layout} 적용`, {
          totalPages: result.totalPages
        })
        return
      }

      onIndicator({ visible: false, current: 0, total: 0, layout: settings.layout })
    },
    [settings, onIndicator]
  )

  // window resize → debounced re-paginate. markdown 재처리 X.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const root = lastRootRef.current
        if (root) runPaginate(root)
      }, RESIZE_DEBOUNCE_MS)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (timer) clearTimeout(timer)
    }
  }, [runPaginate])

  // unmount cleanup
  useEffect(() => {
    return () => {
      if (stripControllerRef.current) {
        stripControllerRef.current.destroy()
        stripControllerRef.current = null
      }
    }
  }, [])

  const handleContentReady = useCallback(
    (root: HTMLElement) => {
      lastRootRef.current = root
      runPaginate(root)
    },
    [runPaginate]
  )

  return { handleContentReady }
}
