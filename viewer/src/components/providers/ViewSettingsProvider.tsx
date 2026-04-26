'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { applyViewSettings, loadViewSettings, saveViewSettings } from '@/lib/viewSettings'
import { VS_DEFAULTS, type ViewSettings } from '@/types/viewSettings'

type Ctx = {
  settings: ViewSettings
  setSettings: (next: ViewSettings) => void
  patch: (partial: Partial<ViewSettings>) => void
}

const ViewSettingsContext = createContext<Ctx | null>(null)

export default function ViewSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<ViewSettings>(VS_DEFAULTS)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const loaded = loadViewSettings()
    setSettingsState(loaded)
    applyViewSettings(loaded)
    setHydrated(true)
  }, [])

  const setSettings = useCallback((next: ViewSettings) => {
    setSettingsState(next)
    saveViewSettings(next)
    applyViewSettings(next)
  }, [])

  const patch = useCallback(
    (partial: Partial<ViewSettings>) => {
      setSettingsState((prev) => {
        const next = { ...prev, ...partial }
        saveViewSettings(next)
        applyViewSettings(next)
        return next
      })
    },
    []
  )

  return (
    <ViewSettingsContext.Provider value={{ settings, setSettings, patch }}>
      {hydrated ? children : null}
    </ViewSettingsContext.Provider>
  )
}

export function useViewSettings(): Ctx {
  const ctx = useContext(ViewSettingsContext)
  if (!ctx) {
    throw new Error('useViewSettings must be used inside ViewSettingsProvider')
  }
  return ctx
}
