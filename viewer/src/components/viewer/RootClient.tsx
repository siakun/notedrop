'use client'

import { useEffect, useState } from 'react'
import { useManifest } from '@/hooks/useManifest'
import Header from './Header'
import Home from './Home'
import EntryView from './EntryView'
import LiveBadge from '@/components/providers/LiveReloadProvider'
import PageIndicator, { type PageIndicatorState } from './PageIndicator'
import type { ManifestItem } from '@/types/manifest'

type Route = { kind: 'home' } | { kind: 'entry'; hash: string }

function parseHashRoute(): Route {
  if (typeof window === 'undefined') return { kind: 'home' }
  const raw = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '').trim()
  if (!raw) return { kind: 'home' }
  return { kind: 'entry', hash: raw }
}

export default function RootClient() {
  const { manifest, error: manifestError } = useManifest()
  const [route, setRoute] = useState<Route>({ kind: 'home' })
  const [mounted, setMounted] = useState(false)
  const [indicator, setIndicator] = useState<PageIndicatorState>({
    visible: false,
    current: 0,
    total: 0,
    layout: 'default'
  })
  // Render token guards against overlapping renders (SSE live-reload mid-flight
  // racing with hashchange clicks).
  const [renderToken, setRenderToken] = useState(0)

  useEffect(() => {
    setMounted(true)
    setRoute(parseHashRoute())
    setRenderToken((t) => t + 1)
    const onHash = () => {
      setRoute(parseHashRoute())
      setRenderToken((t) => t + 1)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (!mounted) return null

  const resolved = resolveRoute(route, manifest?.items ?? [])
  const crumbLabel = resolved?.crumb ?? null

  return (
    <>
      <Header crumbLabel={crumbLabel} />
      <main className={mainClassName(route.kind, resolved)}>
        {manifestError ? (
          <div className="error">매니페스트 로드 실패: {manifestError.message}</div>
        ) : route.kind === 'home' ? (
          <Home items={manifest?.items ?? []} />
        ) : !manifest ? (
          <div className="loading">로딩 중…</div>
        ) : !resolved ? (
          <div className="error">
            찾을 수 없는 항목: <code>{route.hash}</code>
          </div>
        ) : (
          <EntryView
            entry={resolved.entry}
            chapter={resolved.chapter}
            chapters={resolved.chapters}
            renderToken={renderToken}
            onIndicator={setIndicator}
          />
        )}
      </main>
      <PageIndicator state={indicator} />
      <LiveBadge />
    </>
  )
}

function mainClassName(
  kind: Route['kind'],
  resolved: ResolvedEntry | null
): string {
  if (kind === 'home') return 'app-shell'
  if (resolved?.entry?.render === 'book') return 'app-shell book'
  return 'app-shell'
}

type ResolvedEntry = {
  entry: ManifestItem
  chapter: ManifestItem | null
  chapters: ManifestItem[]
  crumb: string
}

function resolveRoute(route: Route, items: ManifestItem[]): ResolvedEntry | null {
  if (route.kind !== 'entry' || items.length === 0) return null
  const target =
    items.find((i) => i.hash === route.hash) ??
    items.find((i) => i.slug === route.hash) ??
    null
  if (!target) return null

  let entry: ManifestItem
  let chapter: ManifestItem | null
  if (target.type === 'chapter' && target.parent) {
    const parent = items.find((i) => i.hash === target.parent)
    if (parent) {
      entry = parent
      chapter = target
    } else {
      entry = target
      chapter = null
    }
  } else {
    entry = target
    chapter = null
  }

  const chapters: ManifestItem[] =
    entry.render === 'book' && entry.chapters
      ? entry.chapters
          .map((h) => items.find((i) => i.hash === h))
          .filter((i): i is ManifestItem => Boolean(i))
      : []

  const crumb =
    chapter && chapter !== entry
      ? `${entry.title} / ${chapter.title}`
      : entry.title

  return { entry, chapter, chapters, crumb }
}
