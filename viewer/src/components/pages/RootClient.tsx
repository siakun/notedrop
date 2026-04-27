'use client'

import { useManifest } from '@/hooks/useManifest'
import { useRoute } from '@/hooks/useRoute'
import { usePageSizeCss } from '@/hooks/usePageSizeCss'
import Header from '@/components/layout/Header'
import Home from './Home'
import EntryView from './EntryView'
import LiveBadge from '@/components/providers/LiveReloadProvider'
import BuildInfoBadge from '@/components/providers/BuildInfoBadge'
import PageIndicator from '@/components/layout/PageIndicator'
import { useIndicator } from '@/stores/viewerStore'
import {
  resolveRoute,
  type ResolvedEntry,
  type Route
} from '@/lib/router'

/**
 * SPA 진입점 — hash 라우팅 분기 + 글로벌 레이아웃 (header + main + indicator
 * + live badge). 비즈니스 로직 0, hook 조합만.
 *
 * indicator state 는 Zustand store (useIndicator). useLayoutPagination 가 직접
 * dispatch — prop drill 폐기.
 */
export default function RootClient() {
  const { route, renderToken, mounted } = useRoute()
  const { manifest, error: manifestError } = useManifest()
  const indicator = useIndicator()
  usePageSizeCss()

  if (!mounted) return null

  const resolved = resolveRoute(route, manifest?.items ?? [])
  const crumbLabel = resolved?.crumb ?? null

  return (
    <>
      <Header crumbLabel={crumbLabel} />
      <main className={mainClassName(route, resolved)}>
        <Body
          route={route}
          resolved={resolved}
          manifestError={manifestError}
          manifest={manifest}
          renderToken={renderToken}
        />
      </main>
      <PageIndicator state={indicator} />
      <LiveBadge />
      <BuildInfoBadge />
    </>
  )
}

function Body({
  route,
  resolved,
  manifestError,
  manifest,
  renderToken
}: {
  route: Route
  resolved: ResolvedEntry | null
  manifestError: Error | null
  manifest: ReturnType<typeof useManifest>['manifest']
  renderToken: number
}) {
  if (manifestError) {
    return <div className="error">매니페스트 로드 실패: {manifestError.message}</div>
  }
  if (route.kind === 'home') {
    return <Home items={manifest?.items ?? []} />
  }
  if (!manifest) {
    return <div className="loading">로딩 중…</div>
  }
  if (!resolved) {
    return (
      <div className="error">
        찾을 수 없는 항목: <code>{route.hash}</code>
      </div>
    )
  }
  return (
    <EntryView
      entry={resolved.entry}
      chapter={resolved.chapter}
      chapters={resolved.chapters}
      manifest={manifest}
      renderToken={renderToken}
    />
  )
}

function mainClassName(route: Route, resolved: ResolvedEntry | null): string {
  if (route.kind === 'home') return 'app-shell'
  if (resolved?.entry?.render === 'book') return 'app-shell book'
  return 'app-shell'
}
