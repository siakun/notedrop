'use client'

import { useMemo } from 'react'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer'
import { useViewSettings } from '@/stores/viewerStore'
import { useContent } from '@/hooks/useContent'
import { useCustomCss } from '@/hooks/useCustomCss'
import { useLayoutPagination } from '@/hooks/useLayoutPagination'
import type { ManifestItem } from '@/types/manifest'
import type { Manifest } from '@/types/manifest'
import Toc from '@/components/book/Toc'
import ChapterNav from '@/components/book/ChapterNav'

export type EntryViewProps = {
  entry: ManifestItem
  chapter: ManifestItem | null
  chapters: ManifestItem[]
  manifest: Manifest
  renderToken: number
}

/**
 * Entry 본문 렌더 + 페이지네이션 + customCss + book 모드 chapter 네비.
 *
 * 핵심 책임은 *조합*: hook 들 (useContent, useCustomCss, useLayoutPagination)
 * 의 결과를 props 로 MarkdownRenderer + Toc + ChapterNav 에 전달. 페이지네이션
 * 알고리즘 + customCss 주입 등 *순수 로직* 은 모두 hook 안에.
 */
export default function EntryView({
  entry,
  chapter,
  chapters,
  manifest,
  renderToken
}: EntryViewProps) {
  void manifest
  const target = chapter ?? entry
  const targetHash = target.hash
  const { content, error } = useContent(targetHash)
  const settings = useViewSettings()

  // settings 가 변경되면 MarkdownRenderer 의 key 가 바뀌어 unmount + remount
  // → 새 paginate trigger. 사용자 노트 콘텐츠 변경 (renderToken) 도 같이.
  const renderKey = useMemo(
    () =>
      `${targetHash}:${renderToken}:${settings.layout}:${settings.pageSize}` +
      `:${settings.marginTop}:${settings.marginBottom}` +
      `:${settings.marginLeft}:${settings.marginRight}`,
    [
      targetHash,
      renderToken,
      settings.layout,
      settings.pageSize,
      settings.marginTop,
      settings.marginBottom,
      settings.marginLeft,
      settings.marginRight
    ]
  )

  useCustomCss(targetHash, content?.frontmatter.customCss ?? null)
  const { handleContentReady } = useLayoutPagination(settings)

  if (error) {
    return <div className="error">콘텐츠 로드 실패: {error.message}</div>
  }
  if (!content) {
    return <div className="loading">로딩 중…</div>
  }

  const showCover = !chapter && entry.cover
  const isBook = entry.render === 'book'

  if (isBook) {
    const idx = chapter
      ? chapters.findIndex((c) => c.hash === chapter.hash)
      : -1
    const prev = idx > 0 ? chapters[idx - 1]! : null
    const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1]! : null

    return (
      <>
        <Toc
          book={entry}
          chapters={chapters}
          activeHash={chapter?.hash ?? entry.hash}
        />
        <article>
          {showCover && entry.cover && (
            <img className="cover" src={normalizeAsset(entry.cover)} alt={`${entry.title} 표지`} />
          )}
          <MarkdownRenderer
            key={renderKey}
            body={content.body}
            pageHash={targetHash}
            onContentReady={handleContentReady}
          />
          <ChapterNav book={entry} prev={prev} next={next} />
        </article>
      </>
    )
  }

  return (
    <article>
      {showCover && entry.cover && (
        <img className="cover" src={normalizeAsset(entry.cover)} alt={`${entry.title} 표지`} />
      )}
      <MarkdownRenderer
        key={renderKey}
        body={content.body}
        pageHash={targetHash}
        onContentReady={handleContentReady}
      />
    </article>
  )
}

function normalizeAsset(p: string): string {
  return p.startsWith('/') ? p.slice(1) : p
}
