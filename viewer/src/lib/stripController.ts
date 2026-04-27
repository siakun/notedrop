import { clamp } from './paginate'
import type { LayoutMode } from '@/types/viewSettings'

export type StripIndicatorUpdate = (current: number, total: number, layout: LayoutMode) => void

export class StripController {
  private current = 0
  private readonly pagesPerView: number
  private readonly boundWheel: (e: WheelEvent) => void
  private readonly boundKey: (e: KeyboardEvent) => void
  private readonly viewport: HTMLElement | null

  constructor(
    private readonly strip: HTMLElement,
    private readonly layout: LayoutMode,
    private readonly total: number,
    private readonly onIndicator: StripIndicatorUpdate
  ) {
    this.pagesPerView = layout === 'two-pages' ? 2 : 1
    this.boundWheel = this.onWheel.bind(this)
    this.boundKey = this.onKey.bind(this)
    this.viewport = strip.parentElement
    if (this.viewport) {
      this.viewport.addEventListener('wheel', this.boundWheel, { passive: false })
    }
    document.addEventListener('keydown', this.boundKey)
    // 첫 update 는 transition 비활성 — settings (페이지 크기/여백) 변경 시
    // strip 새로 생성 → 0 → -groupCenter 슬라이딩 깜빡임 회피.
    // 후속 update (사용자 wheel/key) 는 transition 정상 (페이지 넘기기 효과).
    this.update(true)
  }

  destroy(): void {
    if (this.viewport) {
      this.viewport.removeEventListener('wheel', this.boundWheel)
    }
    document.removeEventListener('keydown', this.boundKey)
  }

  private onWheel(e: WheelEvent): void {
    if (e.shiftKey) return
    e.preventDefault()
    const dir = e.deltaY > 0 || e.deltaX > 0 ? 1 : -1
    this.advance(dir)
  }

  private onKey(e: KeyboardEvent): void {
    if (document.body.dataset.layout !== this.layout) return
    const tag = (document.activeElement as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault()
      this.advance(1)
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault()
      this.advance(-1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      this.goTo(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      this.goTo(this.total - 1)
    }
  }

  private advance(dir: number): void {
    const step = this.pagesPerView
    const groupCount = Math.ceil(this.total / step)
    let groupIdx = Math.floor(this.current / step) + dir
    groupIdx = clamp(groupIdx, 0, groupCount - 1)
    this.goTo(groupIdx * step)
  }

  private goTo(pageIdx: number): void {
    this.current = clamp(pageIdx, 0, this.total - 1)
    this.update()
  }

  private update(skipTransition = false): void {
    const pages = this.strip.querySelectorAll('.paper-page')
    if (pages.length === 0) return
    const pageW = (pages[0] as HTMLElement).offsetWidth
    const gap = 16
    const groupSize = this.pagesPerView
    const groupIdx = Math.floor(this.current / groupSize)
    const groupLeft = groupIdx * groupSize * (pageW + gap)
    const groupWidth = groupSize * pageW + (groupSize - 1) * gap
    const groupCenter = groupLeft + groupWidth / 2

    if (skipTransition) {
      this.strip.style.transition = 'none'
      this.strip.style.transform = `translate(${-groupCenter}px, -50%)`
      // 강제 layout — transition: none 적용 보장 후 raf 에서 transition 복원
      void this.strip.offsetHeight
      requestAnimationFrame(() => {
        this.strip.style.transition = ''
      })
    } else {
      this.strip.style.transform = `translate(${-groupCenter}px, -50%)`
    }

    this.onIndicator(this.current, this.total, this.layout)
  }
}
