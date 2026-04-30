'use client'

import type { ManifestItem } from '@/types/manifest'

export type TocProps = {
  book: ManifestItem
  chapters: ManifestItem[]
  activeHash: string
}

type TocGroup = {
  /** null 이면 root 그룹 (entry 폴더 직속 챕터). */
  section: string | null
  chapters: ManifestItem[]
}

/** chapter 들을 section 별로 그룹화. 그룹 정렬:
 *  1. Part N → 숫자 오름차순 (Part 0, Part 1, ..., Part 8)
 *  2. 부록 X → 알파벳 오름차순 (부록 A, B, C)
 *  3. 그 외 명명 section → 이름 사전순
 *  4. root (section=null) → 항상 마지막
 * 그룹 안 chapter 순서는 manifest 의 order 그대로 보존. */
function groupChapters(chapters: ManifestItem[]): TocGroup[] {
  const groups = new Map<string, TocGroup>()
  for (const ch of chapters) {
    const key = ch.section ?? '__root__'
    let group = groups.get(key)
    if (!group) {
      group = { section: ch.section ?? null, chapters: [] }
      groups.set(key, group)
    }
    group.chapters.push(ch)
  }
  return [...groups.values()].sort(compareGroups)
}

type SectionKind = 'part' | 'appendix' | 'other' | 'root'

function classifySection(section: string | null): { kind: SectionKind; key: string } {
  if (section === null) return { kind: 'root', key: '' }
  const partMatch = /^Part\s+(\d+)/i.exec(section)
  if (partMatch) {
    return { kind: 'part', key: String(partMatch[1]!).padStart(4, '0') }
  }
  const appMatch = /^부록\s+(\S+)/.exec(section)
  if (appMatch) {
    return { kind: 'appendix', key: appMatch[1]! }
  }
  return { kind: 'other', key: section }
}

const KIND_ORDER: Record<SectionKind, number> = {
  part: 0,
  appendix: 1,
  other: 2,
  root: 3
}

function compareGroups(a: TocGroup, b: TocGroup): number {
  const aC = classifySection(a.section)
  const bC = classifySection(b.section)
  if (aC.kind !== bC.kind) return KIND_ORDER[aC.kind] - KIND_ORDER[bC.kind]
  return aC.key.localeCompare(bC.key)
}

export default function Toc({ book, chapters, activeHash }: TocProps) {
  const groups = groupChapters(chapters)
  const activeSection = chapters.find((c) => c.hash === activeHash)?.section ?? null

  return (
    <aside className="toc">
      <h3>{book.title}</h3>
      <ol className="toc-root">
        <li>
          <a
            href={`#/${book.slug ?? book.hash}/`}
            className={activeHash === book.hash ? 'active' : ''}
          >
            서문
          </a>
        </li>
        {groups.map((group) => {
          if (group.section === null) {
            // root 그룹 — 펼침 없이 나열
            return group.chapters.map((c) => (
              <li key={c.hash}>
                <a
                  href={`#/${c.slug ?? c.hash}/`}
                  className={c.hash === activeHash ? 'active' : ''}
                >
                  {c.title}
                </a>
              </li>
            ))
          }
          const isActiveSection = activeSection === group.section
          return (
            <li key={group.section} className="toc-group">
              <details open={isActiveSection}>
                <summary>{group.section}</summary>
                <ol>
                  {group.chapters.map((c) => (
                    <li key={c.hash}>
                      <a
                        href={`#/${c.slug ?? c.hash}/`}
                        className={c.hash === activeHash ? 'active' : ''}
                      >
                        {c.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
