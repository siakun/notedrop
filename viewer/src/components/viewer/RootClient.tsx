'use client'

import { useEffect, useState } from 'react'
import HomeClient from './HomeClient'
import EntryClient from './EntryClient'
import { useManifest } from '@/hooks/useManifest'

function parseHashRoute(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.location.hash
  if (!raw || raw === '#' || raw === '#/') return null
  const stripped = raw.replace(/^#\/?/, '').replace(/\/$/, '')
  return stripped || null
}

function resolveHashToHash(target: string, manifest: ReturnType<typeof useManifest>['manifest']): string | null {
  if (!manifest) return null
  const direct = manifest.items.find((it) => it.hash === target)
  if (direct) return direct.hash
  const bySlug = manifest.items.find((it) => it.slug === target)
  if (bySlug) return bySlug.hash
  return null
}

export default function RootClient() {
  const [route, setRoute] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const { manifest } = useManifest()

  useEffect(() => {
    setMounted(true)
    setRoute(parseHashRoute())
    const onHash = () => setRoute(parseHashRoute())
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  if (!mounted) return null

  if (route === null) {
    return <HomeClient />
  }

  const resolvedHash = resolveHashToHash(route, manifest)
  if (resolvedHash === null && manifest) {
    return (
      <main className="notedrop-entry">
        <a href="#/">← 홈</a>
        <h1>찾을 수 없는 항목</h1>
        <p>슬러그 또는 해시 <code>{route}</code> 가 manifest 에 없습니다.</p>
      </main>
    )
  }

  if (!manifest) {
    return (
      <main className="notedrop-entry">
        <p>로딩 중…</p>
      </main>
    )
  }

  return <EntryClient hash={resolvedHash!} />
}
