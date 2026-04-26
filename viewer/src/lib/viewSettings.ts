import {
  PAGE_DIMS,
  FONT_STACKS,
  VS_DEFAULTS,
  VS_STORAGE_KEY,
  type ViewSettings
} from '@/types/viewSettings'

export function loadViewSettings(): ViewSettings {
  if (typeof window === 'undefined') return { ...VS_DEFAULTS }
  try {
    const raw = window.localStorage.getItem(VS_STORAGE_KEY)
    if (!raw) return { ...VS_DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<ViewSettings>
    return { ...VS_DEFAULTS, ...parsed }
  } catch {
    return { ...VS_DEFAULTS }
  }
}

export function saveViewSettings(settings: ViewSettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VS_STORAGE_KEY, JSON.stringify(settings))
  } catch {}
}

export function applyViewSettings(settings: ViewSettings): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = settings.theme
  document.body.dataset.layout = settings.layout
  const root = document.documentElement.style
  root.setProperty('--user-font-stack', FONT_STACKS[settings.font] ?? 'inherit')
  root.setProperty('--user-font-scale', String(settings.fontScale))
  root.setProperty('--user-line-scale', String(settings.lineScale))
  root.setProperty('--user-text-align', settings.align)
  const dims = PAGE_DIMS[settings.pageSize]
  root.setProperty('--page-width', `${dims.w}mm`)
  root.setProperty('--page-height', `${dims.h}mm`)
  root.setProperty('--page-margin-top', `${settings.marginTop}mm`)
  root.setProperty('--page-margin-bottom', `${settings.marginBottom}mm`)
  root.setProperty('--page-margin-left', `${settings.marginLeft}mm`)
  root.setProperty('--page-margin-right', `${settings.marginRight}mm`)
}
