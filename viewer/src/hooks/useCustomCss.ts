'use client'

import { useEffect } from 'react'
import { logger } from '@/lib/logger'

/**
 * Page customCss 주입·격리 (§13.5 + ADR-0016). 각 entry 가 frontmatter 의
 * customCss 필드 (이미 ContentTransformer 가 sanitize 한 raw CSS) 를 가짐.
 *
 * 동작:
 *  - hash 별 `<style data-notedrop-css="<hash>">` 을 head 에 주입
 *  - cleanup: hash 또는 css 변경 시 옛 style 제거
 *  - .entry-content { ... } 로 자동 wrap (격리)
 *
 * 인덱스 페이지 또는 customCss 없는 entry 는 hash="" 또는 css=null — no-op.
 */
export function useCustomCss(hash: string, css: string | null): void {
  useEffect(() => {
    if (!css || !hash) return
    if (typeof document === 'undefined') return
    const style = document.createElement('style')
    style.dataset.notedropCss = hash
    style.textContent = `.entry-content { ${css} }`
    document.head.appendChild(style)
    logger.debug('view-settings', 'customCss 주입', { hash, length: css.length })
    return () => {
      style.remove()
      logger.debug('view-settings', 'customCss 제거', { hash })
    }
  }, [hash, css])
}
