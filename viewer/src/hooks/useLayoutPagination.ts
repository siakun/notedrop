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

/**
 * Markdown 렌더 완료 후 layout 모드 별 페이지네이션 + PageIndicator 상태
 * 갱신. EntryView 의 핵심 로직 hook 추출 — 컴포넌트는 단순 "ref + 콜백
 * 받음" 만.
 *
 * Layout 별 동작:
 *  - default: 페이지네이션 X (일반 flow). indicator 숨김.
 *  - vertical: paginateVertical (paper-page 분리). indicator 숨김.
 *  - horizontal/two-pages: paginateStrip + StripController (가상 가로
 *    스크롤 + 휠/키 이벤트 hijack). indicator 표시.
 *
 * StripController 인스턴스는 ref 보관, layout 변경 또는 unmount 시 자동
 * destroy (wheel/keydown listener 정리).
 */
export function useLayoutPagination(
  settings: ViewSettings,
  onIndicator: (state: PageIndicatorState) => void
): { handleContentReady: (root: HTMLElement) => void } {
  const stripControllerRef = useRef<StripController | null>(null)

  // unmount 시 cleanup. layout 변경 시 handleContentReady 가 직접 destroy.
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
      // 옛 controller 가 있으면 entry-content null check 보다 *먼저* destroy —
      // home 으로 navigate 시 listener 잔존 방지 (§13.6.3).
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

      // default layout — 페이지네이션 X
      onIndicator({ visible: false, current: 0, total: 0, layout: settings.layout })
    },
    // settings 의 어떤 값이든 변경 시 새 콜백 — paginate 다시
    [settings, onIndicator]
  )

  return { handleContentReady }
}
