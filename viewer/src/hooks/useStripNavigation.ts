'use client'

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { clamp } from '@/lib/paginate'
import { useSetIndicator } from '@/stores/viewerStore'
import type { LayoutMode } from '@/types/viewSettings'

const PAGE_GAP = 16

/**
 * .page-strip 의 가상 가로 스크롤 navigation. StripController class 의
 * React idiomatic 변환:
 *  - wheel listener: viewport (strip 의 부모) 에 등록
 *  - keydown listener: document 에 등록 (Arrow/PageUp/PageDown/Home/End/Space)
 *  - transform: useLayoutEffect 에서 strip.style.transform set
 *  - settings 변경 시 첫 transform 은 transition 비활성 (슬라이딩 방지)
 *  - indicator state: useSetIndicator 직접 dispatch
 *
 * layout='vertical' 또는 'default' 일 때 no-op.
 */
export function useStripNavigation(
  stripRef: RefObject<HTMLElement | null>,
  layout: LayoutMode,
  total: number
): void {
  const setIndicator = useSetIndicator()
  const [current, setCurrent] = useState(0)
  const isFirstUpdate = useRef(true)

  const isStrip = layout === 'horizontal' || layout === 'two-pages'
  const pagesPerView = layout === 'two-pages' ? 2 : 1

  // total 또는 layout 변경 시 current 리셋
  useEffect(() => {
    setCurrent(0)
    isFirstUpdate.current = true
  }, [total, layout])

  // strip transform — current 변경 시 transition 정상, 초기엔 transition 비활성
  useLayoutEffect(() => {
    if (!isStrip) return
    const strip = stripRef.current
    if (!strip) return
    const pages = strip.querySelectorAll('.paper-page')
    if (pages.length === 0) return
    const pageW = (pages[0] as HTMLElement).offsetWidth
    const groupSize = pagesPerView
    const groupIdx = Math.floor(current / groupSize)
    const groupLeft = groupIdx * groupSize * (pageW + PAGE_GAP)
    const groupWidth = groupSize * pageW + (groupSize - 1) * PAGE_GAP
    const groupCenter = groupLeft + groupWidth / 2

    if (isFirstUpdate.current) {
      strip.style.transition = 'none'
      strip.style.transform = `translate(${-groupCenter}px, -50%)`
      void strip.offsetHeight
      requestAnimationFrame(() => {
        strip.style.transition = ''
      })
      isFirstUpdate.current = false
    } else {
      strip.style.transform = `translate(${-groupCenter}px, -50%)`
    }
  }, [stripRef, isStrip, current, pagesPerView, total])

  // indicator state 갱신
  useEffect(() => {
    if (!isStrip) return
    setIndicator({ visible: true, current, total, layout })
  }, [isStrip, current, total, layout, setIndicator])

  // wheel listener
  useEffect(() => {
    if (!isStrip) return
    const strip = stripRef.current
    const viewport = strip?.parentElement
    if (!viewport) return
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) return
      e.preventDefault()
      const dir = e.deltaY > 0 || e.deltaX > 0 ? 1 : -1
      setCurrent((c) => {
        const groupCount = Math.ceil(total / pagesPerView)
        let groupIdx = Math.floor(c / pagesPerView) + dir
        groupIdx = clamp(groupIdx, 0, Math.max(0, groupCount - 1))
        return clamp(groupIdx * pagesPerView, 0, Math.max(0, total - 1))
      })
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [stripRef, isStrip, total, pagesPerView])

  // keydown listener
  useEffect(() => {
    if (!isStrip) return
    const onKey = (e: KeyboardEvent) => {
      if (typeof document === 'undefined') return
      if (document.body.dataset.layout !== layout) return
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        setCurrent((c) => {
          const groupCount = Math.ceil(total / pagesPerView)
          let groupIdx = Math.floor(c / pagesPerView) + 1
          groupIdx = clamp(groupIdx, 0, Math.max(0, groupCount - 1))
          return clamp(groupIdx * pagesPerView, 0, Math.max(0, total - 1))
        })
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        setCurrent((c) => {
          let groupIdx = Math.floor(c / pagesPerView) - 1
          groupIdx = clamp(groupIdx, 0, Math.max(0, Math.ceil(total / pagesPerView) - 1))
          return clamp(groupIdx * pagesPerView, 0, Math.max(0, total - 1))
        })
      } else if (e.key === 'Home') {
        e.preventDefault()
        setCurrent(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setCurrent(Math.max(0, total - 1))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isStrip, layout, total, pagesPerView])
}
