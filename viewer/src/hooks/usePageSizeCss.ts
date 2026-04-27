'use client'

import { useEffect } from 'react'
import { useViewSettings } from '@/components/providers/ViewSettingsProvider'
import { PAGE_DIMS } from '@/types/viewSettings'
import { mmToPx } from '@/lib/paginate'

/**
 * Page CSS 변수 (--page-width, --page-height, --page-margin-* 등) 갱신.
 * settings 의 layout/pageSize/margin* 변경 시 자동 update. paper-page 컴포넌트
 * 가 이 변수 사용 → 사이즈 변경 시 즉시 반영.
 *
 * Default layout 은 paper-page 미사용이라 변수 미참조 — 단 설정해도 무해.
 */
export function usePageSizeCss(): void {
  const { settings } = useViewSettings()

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement.style
    // 'auto' 면 mm 단위 CSS variable 무관 — paginate 가 inline style 로 fit 결과
    // 적용. 기존 variable 도 유지 (다른 layout 에서 참조하면 문제 없게 last 값 그대로).
    if (settings.pageSize !== 'Auto') {
      const dims = PAGE_DIMS[settings.pageSize]
      root.setProperty('--page-width-mm', `${dims.w}mm`)
      root.setProperty('--page-height-mm', `${dims.h}mm`)
      root.setProperty('--page-width-px', `${mmToPx(dims.w)}px`)
      root.setProperty('--page-height-px', `${mmToPx(dims.h)}px`)
    }
    root.setProperty('--page-margin-top-mm', `${settings.marginTop}mm`)
    root.setProperty('--page-margin-bottom-mm', `${settings.marginBottom}mm`)
    root.setProperty('--page-margin-left-mm', `${settings.marginLeft}mm`)
    root.setProperty('--page-margin-right-mm', `${settings.marginRight}mm`)
  }, [
    settings.pageSize,
    settings.marginTop,
    settings.marginBottom,
    settings.marginLeft,
    settings.marginRight
  ])
}
