import type { ManifestItem } from '@/types/manifest'
import type { Route } from '@/hooks/useRoute'

export type { Route }

/**
 * 해석된 entry 라우팅 정보. RootClient + Header 가 사용.
 *  - entry: 표시할 책/문서 (chapter 의 부모 또는 entry 자신)
 *  - chapter: 책 모드에서 활성 chapter (없으면 null = 책 표지/서문)
 *  - chapters: 책 모드의 chapter 배열 (book 의 chapters 필드 기반)
 *  - crumb: header 의 #crumbs 영역에 표시할 제목 (book/chapter 결합)
 */
export type ResolvedEntry = {
  entry: ManifestItem
  chapter: ManifestItem | null
  chapters: ManifestItem[]
  crumb: string
}

/**
 * Route + manifest 로 표시할 entry 해석.
 *
 *  - home → null (Home 컴포넌트가 처리)
 *  - entry hash → manifest 에서 찾기 (slug fallback)
 *  - chapter hash → 부모 book 으로 redirect + chapter 활성
 *  - 미발견 → null (404 표시)
 */
export function resolveRoute(
  route: Route,
  items: ManifestItem[]
): ResolvedEntry | null {
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
