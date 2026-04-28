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
  const prevLayoutRef = useRef<LayoutMode | null>(null)
  const prevTotalRef = useRef<number>(0)

  const isStrip = layout === 'horizontal' || layout === 'two-pages'
  const pagesPerView = layout === 'two-pages' ? 2 : 1

  // strip transform — layout/total 변경 직후만 transition 비활성 (snap), 그 외엔
  // 정상 transition. layout 또는 total 변경 시 current 도 inline 으로 0 으로 리셋.
  // (별도 useEffect 로 리셋하면 paint 후 isFirstUpdate 가 재무장돼 첫 wheel 이
  // 애니메이션 없이 snap 으로 동작하던 회귀 — 단일 layoutEffect 통합으로 해결.)
  useLayoutEffect(() => {
    if (!isStrip) {
      prevLayoutRef.current = null
      prevTotalRef.current = 0
      return
    }
    const strip = stripRef.current
    if (!strip) return
    const pages = strip.querySelectorAll('.paper-page')
    if (pages.length === 0) return

    const layoutChanged = prevLayoutRef.current !== layout
    const totalChanged = prevTotalRef.current !== total

    // layout/total 변경 + current 가 아직 0 이 아니면 0 으로 리셋 후 재렌더 대기.
    // refs 는 이번 패스에서 갱신하지 않아 다음 패스에서도 layoutChanged=true 로
    // snap 처리됨.
    if ((layoutChanged || totalChanged) && current !== 0) {
      setCurrent(0)
      return
    }

    prevLayoutRef.current = layout
    prevTotalRef.current = total

    const pageW = (pages[0] as HTMLElement).offsetWidth
    const groupSize = pagesPerView
    const groupIdx = Math.floor(current / groupSize)
    const groupLeft = groupIdx * groupSize * (pageW + PAGE_GAP)
    const groupWidth = groupSize * pageW + (groupSize - 1) * PAGE_GAP
    const groupCenter = groupLeft + groupWidth / 2

    if (layoutChanged || totalChanged) {
      strip.style.transition = 'none'
      strip.style.transform = `translate(${-groupCenter}px, -50%)`
      void strip.offsetHeight
      requestAnimationFrame(() => {
        strip.style.transition = ''
      })
    } else {
      strip.style.transform = `translate(${-groupCenter}px, -50%)`
    }
  }, [stripRef, isStrip, layout, current, pagesPerView, total])

  // indicator state 갱신
  useEffect(() => {
    if (!isStrip) return
    if (total <= 0) {
      setIndicator({ visible: false, current: 0, total: 0, layout })
      return
    }
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
