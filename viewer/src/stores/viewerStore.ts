/**
 * Zustand store — viewer 의 client state 통합 진입점.
 *
 * v0.1.56 도입: settings slice 만. paginate / live 는 후속 단계 (v0.1.57+).
 *
 * 책임 분리:
 *  - createSettingsSlice — ViewSettings + patch + reset (persist middleware)
 *
 * persist middleware: localStorage key = VS_STORAGE_KEY. v0.1.53 옛 'auto'
 * → 'Auto' 마이그레이션은 migrate 핸들러에서 처리.
 *
 * Server state (manifest, content) 는 Resource<T> (lib/manifestClient,
 * contentClient) 그대로 — 1차 리팩토링 범위 외.
 */

import { create } from 'zustand'
import { persist, type PersistStorage } from 'zustand/middleware'
import {
  VS_DEFAULTS,
  VS_STORAGE_KEY,
  type ViewSettings
} from '@/types/viewSettings'
import { applyViewSettings } from '@/lib/viewSettings'

type SettingsSlice = {
  settings: ViewSettings
  patchSettings: (partial: Partial<ViewSettings>) => void
  resetSettings: () => void
}

type ViewerStore = SettingsSlice

/**
 * persist 의 store version. v0.1.53 'auto' → v0.1.54+ 'Auto' 마이그레이션은
 * version 1 에서 0 → 1 이지만 도입 늦어 0 그대로 두고 migrate 함수에서 처리.
 */
const STORE_VERSION = 1

const localStorageJson: PersistStorage<{ settings: ViewSettings }> = {
  getItem: (name) => {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(name)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(name, JSON.stringify(value))
  },
  removeItem: (name) => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(name)
  }
}

export const useViewerStore = create<ViewerStore>()(
  persist(
    (set) => ({
      settings: VS_DEFAULTS,
      patchSettings: (partial) => {
        set((state) => {
          const next = { ...state.settings, ...partial }
          applyViewSettings(next)
          return { settings: next }
        })
      },
      resetSettings: () => {
        applyViewSettings(VS_DEFAULTS)
        set({ settings: VS_DEFAULTS })
      }
    }),
    {
      name: VS_STORAGE_KEY,
      storage: localStorageJson,
      version: STORE_VERSION,
      // 옛 ViewSettingsProvider 의 storage 형식 (직렬화 ViewSettings 만) → Zustand
      // persist 형식 ({state: {settings}, version}) 마이그레이션.
      migrate: (persistedState, version): { settings: ViewSettings } => {
        if (version === STORE_VERSION) {
          return persistedState as { settings: ViewSettings }
        }
        // 버전 0 (옛 형식): {theme, layout, pageSize, ...} 직렬 = ViewSettings 자체.
        const old = persistedState as Record<string, unknown> & {
          settings?: unknown
        }
        const candidate =
          old && typeof old.settings === 'object' && old.settings !== null
            ? (old.settings as Record<string, unknown>)
            : (old as Record<string, unknown>)
        // v0.1.53 옛 'auto' → 'Auto' 호환 (이전 마이그레이션 동일)
        if (candidate.pageSize === 'auto') candidate.pageSize = 'Auto'
        return {
          settings: { ...VS_DEFAULTS, ...(candidate as Partial<ViewSettings>) }
        }
      },
      onRehydrateStorage: () => (state) => {
        if (state?.settings) applyViewSettings(state.settings)
      },
      partialize: (state) => ({ settings: state.settings })
    }
  )
)

/** Hook — settings 만 select 하는 단축형 (re-render 최소화). */
export function useViewSettings(): ViewSettings {
  return useViewerStore((s) => s.settings)
}

/** Hook — patch 함수만 select. */
export function usePatchSettings(): (partial: Partial<ViewSettings>) => void {
  return useViewerStore((s) => s.patchSettings)
}
