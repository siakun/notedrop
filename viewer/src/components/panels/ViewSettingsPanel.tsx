'use client'

import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { usePatchSettings, useViewSettings } from '@/stores/viewerStore'
import {
  FONT_MAX,
  FONT_MIN,
  FONT_OPTIONS,
  FONT_STEP,
  LINE_MAX,
  LINE_MIN,
  LINE_STEP,
  MARGIN_MAX,
  MARGIN_MIN,
  type AlignMode,
  type FontKey,
  type LayoutMode,
  type PageSize,
  type Theme
} from '@/types/viewSettings'
import { clamp, round1 } from '@/lib/paginate'
import { withBase } from '@/lib/basePath'

// 사용자 hardcoded asset path 는 withBase() 로 placeholder 명시. publish 시
// PlanFactory 가 share repo segment 로 변환. lib/basePath.ts 참조.
const LAYOUT_OPTIONS: { value: LayoutMode; iconUrl: string; label: string }[] = [
  { value: 'default', iconUrl: withBase('/icons/view-settings/layout-default.svg'), label: 'Default' },
  { value: 'vertical', iconUrl: withBase('/icons/view-settings/layout-vertical.svg'), label: 'Vertical Scroll' },
  { value: 'horizontal', iconUrl: withBase('/icons/view-settings/layout-horizontal.svg'), label: 'Horizontal Scroll' },
  { value: 'two-pages', iconUrl: withBase('/icons/view-settings/layout-two-pages.svg'), label: 'Two Pages' }
]

const PAGE_SIZE_OPTIONS: PageSize[] = ['Auto', 'B4', 'A4', 'B5', 'A5']

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'night', label: 'Night' }
]

const ALIGN_OPTIONS: { value: AlignMode; label: string }[] = [
  { value: 'left', label: '왼쪽' },
  { value: 'justify', label: '양쪽' }
]

const MARGIN_KEYS = {
  top: 'marginTop',
  bottom: 'marginBottom',
  left: 'marginLeft',
  right: 'marginRight'
} as const

type MarginSide = keyof typeof MARGIN_KEYS
type StepDirection = 'up' | 'down'

const MARGIN_FIELDS: { side: MarginSide; key: MarginSide }[] = [
  { side: 'top', key: 'top' },
  { side: 'bottom', key: 'bottom' },
  { side: 'left', key: 'left' },
  { side: 'right', key: 'right' }
]

function MarginDirectionIcon({ side }: { side: MarginSide }) {
  const path = {
    top: 'M8 13V3M4.5 6.5 8 3l3.5 3.5',
    bottom: 'M8 3v10M4.5 9.5 8 13l3.5-3.5',
    left: 'M13 8H3M6.5 4.5 3 8l3.5 3.5',
    right: 'M3 8h10M9.5 4.5 13 8l-3.5 3.5'
  }[side]

  return (
    <svg
      className="vs-margin-direction-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  )
}

function StepChevronIcon({ direction }: { direction: StepDirection }) {
  const path = direction === 'up' ? 'M3 6.5 6 3.5l3 3' : 'M3 3.5l3 3 3-3'

  return (
    <svg
      className="vs-margin-step-icon"
      viewBox="0 0 12 10"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  )
}

export default function ViewSettingsPanel() {
  const settings = useViewSettings()
  const patch = usePatchSettings()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (panelRef.current?.contains(t)) return
      if (btnRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const isBookOnly = settings.layout !== 'default'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="view-settings-btn"
        aria-expanded={open}
        aria-label="보기 설정"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="aA-icon">
          <span className="aA-small">A</span>
          <span className="aA-large">A</span>
        </span>
      </button>

      <div
        ref={panelRef}
        className="view-settings-panel"
        hidden={!open}
        role="dialog"
        aria-label="보기 설정"
      >
        <h2 className="vs-title">보기 설정</h2>

        <section className="vs-section">
          <p className="vs-label">레이아웃</p>
          <div className="vs-layouts">
            {LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="vs-layout"
                aria-checked={settings.layout === opt.value}
                onClick={() => patch({ layout: opt.value })}
              >
                <span
                  className="vs-layout-icon"
                  style={{ '--layout-icon-url': `url(${opt.iconUrl})` } as CSSProperties}
                  aria-hidden="true"
                />
                <span className="vs-layout-name">{opt.label}</span>
              </button>
            ))}
          </div>
        </section>

        {isBookOnly && (
          <section className="vs-section vs-book-only">
            <p className="vs-label">페이지 크기</p>
            <div className="vs-page-sizes">
              {PAGE_SIZE_OPTIONS.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className="vs-page-size"
                  aria-checked={settings.pageSize === sz}
                  onClick={() => patch({ pageSize: sz })}
                >
                  {sz}
                </button>
              ))}
            </div>
          </section>
        )}

        {isBookOnly && (
          <section className="vs-section vs-book-only">
            <p className="vs-label">여백 (mm)</p>
            <div className="vs-margins">
              {MARGIN_FIELDS.map((f) => {
                const settingKey = MARGIN_KEYS[f.key]
                const inputId = `vs-margin-${f.side}`
                return (
                  <div key={f.side} className="vs-margin">
                    <span className="vs-margin-icon" aria-hidden="true">
                      <MarginDirectionIcon side={f.side} />
                    </span>
                    <label className="vs-margin-label" htmlFor={inputId}>
                      {f.side} 여백
                    </label>
                    <input
                      id={inputId}
                      type="number"
                      min={MARGIN_MIN}
                      max={MARGIN_MAX}
                      value={settings[settingKey]}
                      onChange={(e) => {
                        const n = clamp(
                          Number.parseInt(e.target.value, 10),
                          MARGIN_MIN,
                          MARGIN_MAX
                        )
                        if (Number.isFinite(n)) patch({ [settingKey]: n })
                      }}
                      aria-label={`${f.side} 여백`}
                    />
                    <span className="vs-margin-stepper">
                      <button
                        type="button"
                        className="vs-margin-step"
                        aria-label={`${f.side} 여백 늘리기`}
                        onClick={() =>
                          patch({
                            [settingKey]: clamp(
                              settings[settingKey] + 1,
                              MARGIN_MIN,
                              MARGIN_MAX
                            )
                          })
                        }
                      >
                        <StepChevronIcon direction="up" />
                      </button>
                      <button
                        type="button"
                        className="vs-margin-step"
                        aria-label={`${f.side} 여백 줄이기`}
                        onClick={() =>
                          patch({
                            [settingKey]: clamp(
                              settings[settingKey] - 1,
                              MARGIN_MIN,
                              MARGIN_MAX
                            )
                          })
                        }
                      >
                        <StepChevronIcon direction="down" />
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section className="vs-section">
          <p className="vs-label">테마</p>
          <div className="vs-themes">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`vs-theme vs-theme-${t.value}`}
                aria-checked={settings.theme === t.value}
                onClick={() => patch({ theme: t.value })}
              >
                <span className="vs-theme-swatch">Aa</span>
                <span className="vs-theme-name">{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="vs-section">
          <p className="vs-label">글꼴</p>
          <select
            className="vs-select"
            value={settings.font}
            onChange={(e) => patch({ font: e.target.value as FontKey })}
            aria-label="글꼴"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </section>

        <section className="vs-section">
          <p className="vs-label">글꼴 크기</p>
          <div className="vs-stepper">
            <button
              type="button"
              className="vs-step-btn"
              onClick={() =>
                patch({
                  fontScale: clamp(round1(settings.fontScale - FONT_STEP), FONT_MIN, FONT_MAX)
                })
              }
              disabled={settings.fontScale <= FONT_MIN + 0.001}
              aria-label="글꼴 크기 줄이기"
            >
              T−
            </button>
            <span className="vs-step-value">{Math.round(settings.fontScale * 100)}%</span>
            <button
              type="button"
              className="vs-step-btn"
              onClick={() =>
                patch({
                  fontScale: clamp(round1(settings.fontScale + FONT_STEP), FONT_MIN, FONT_MAX)
                })
              }
              disabled={settings.fontScale >= FONT_MAX - 0.001}
              aria-label="글꼴 크기 키우기"
            >
              T+
            </button>
          </div>
        </section>

        <section className="vs-section">
          <p className="vs-label">행 간격</p>
          <div className="vs-stepper">
            <button
              type="button"
              className="vs-step-btn"
              onClick={() =>
                patch({
                  lineScale: clamp(round1(settings.lineScale - LINE_STEP), LINE_MIN, LINE_MAX)
                })
              }
              disabled={settings.lineScale <= LINE_MIN + 0.001}
              aria-label="행 간격 줄이기"
            >
              ↕−
            </button>
            <span className="vs-step-value">{Math.round(settings.lineScale * 100)}%</span>
            <button
              type="button"
              className="vs-step-btn"
              onClick={() =>
                patch({
                  lineScale: clamp(round1(settings.lineScale + LINE_STEP), LINE_MIN, LINE_MAX)
                })
              }
              disabled={settings.lineScale >= LINE_MAX - 0.001}
              aria-label="행 간격 늘리기"
            >
              ↕+
            </button>
          </div>
        </section>

        <section className="vs-section">
          <p className="vs-label">정렬</p>
          <div className="vs-aligns">
            {ALIGN_OPTIONS.map((a) => (
              <button
                key={a.value}
                type="button"
                className="vs-align"
                aria-checked={settings.align === a.value}
                onClick={() => patch({ align: a.value })}
              >
                {a.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
