'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type PageSizeKey } from '@/lib/paginationConfig'

const STORAGE_KEY = 'notedrop:page-size'

const subscribers = new Set<(size: PageSizeKey) => void>()

export function usePageSize(): {
  size: PageSizeKey
  setSize: (next: PageSizeKey) => void
} {
  const [size, setSizeState] = useState<PageSizeKey>(DEFAULT_PAGE_SIZE)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && stored in PAGE_SIZES) {
      setSizeState(stored as PageSizeKey)
    }
    const onSubscribe = (next: PageSizeKey) => setSizeState(next)
    subscribers.add(onSubscribe)
    return () => {
      subscribers.delete(onSubscribe)
    }
  }, [])

  const setSize = (next: PageSizeKey) => {
    setSizeState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
    for (const fn of subscribers) {
      try { fn(next) } catch {}
    }
  }

  return { size, setSize }
}
