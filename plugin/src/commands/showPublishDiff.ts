import { Modal, Notice } from 'obsidian'
import * as Diff from 'diff'
import type { PublishedFileSnapshot } from '../settings/PluginSettings.js'
import type { PluginContext } from '../services/PluginContext.js'
import type { CommandDef } from './types.js'

type FileStatus = 'added' | 'modified' | 'removed'

type DiffEntry = {
  path: string
  status: FileStatus
  prev: string | null
  curr: string | null
  prevIsBinary: boolean
  currIsBinary: boolean
}

class PublishDiffModal extends Modal {
  private entries: DiffEntry[] = []
  private activePath: string | null = null

  constructor(private readonly ctx: PluginContext) {
    super(ctx.app)
    this.modalEl.addClass('notedrop-diff-modal')
  }

  override async onOpen(): Promise<void> {
    const { contentEl } = this
    contentEl.empty()
    const loading = contentEl.createDiv({ cls: 'notedrop-diff-loading', text: '계산 중…' })

    let diff
    try {
      diff = await this.ctx.dirtyTracker.computeDiff()
    } catch (err) {
      loading.setText(`계산 실패: ${(err as Error).message}`)
      return
    }
    loading.remove()

    this.entries = collectEntries(diff)
    if (this.entries.length === 0) {
      const empty = contentEl.createDiv({ cls: 'notedrop-diff-empty' })
      empty.createEl('h3', { text: '변경 사항 없음' })
      empty.createEl('p', {
        text: diff.hasBaseline
          ? '마지막 발행 이후 의미적 변경 0건. (updatedAt timestamp 만 다른 경우는 변경으로 보지 않습니다.)'
          : '공유된 노트가 없습니다.'
      })
      return
    }

    if (!diff.hasBaseline) {
      const banner = contentEl.createDiv({ cls: 'notedrop-diff-banner' })
      banner.setText('최초 발행 — 비교 대상 없음. 모든 파일이 새로 추가됩니다.')
    }

    this.activePath = this.entries[0]!.path
    this.render()
  }

  override onClose(): void {
    this.contentEl.empty()
  }

  private render(): void {
    const layout = this.contentEl.querySelector('.notedrop-diff-layout')
    if (layout) layout.remove()

    const root = this.contentEl.createDiv({ cls: 'notedrop-diff-layout' })

    const sidebar = root.createDiv({ cls: 'notedrop-diff-sidebar' })
    sidebar.createEl('h3', {
      cls: 'notedrop-diff-sidebar-header',
      text: `${this.entries.length} changed file${this.entries.length === 1 ? '' : 's'}`
    })
    const ul = sidebar.createEl('ul', { cls: 'notedrop-diff-file-list' })
    for (const entry of this.entries) {
      const li = ul.createEl('li', {
        cls: `notedrop-diff-file notedrop-diff-file-${entry.status}${entry.path === this.activePath ? ' is-active' : ''}`
      })
      li.createSpan({ cls: 'notedrop-diff-file-name', text: entry.path })
      const badge = li.createSpan({
        cls: `notedrop-diff-status notedrop-diff-status-${entry.status}`
      })
      badge.setText(statusGlyph(entry.status))
      li.addEventListener('click', () => {
        this.activePath = entry.path
        this.render()
      })
    }

    const main = root.createDiv({ cls: 'notedrop-diff-main' })
    const active = this.entries.find((e) => e.path === this.activePath)
    if (!active) {
      main.createDiv({ cls: 'notedrop-diff-empty', text: '파일 선택' })
      return
    }
    main.createDiv({ cls: 'notedrop-diff-main-header', text: active.path })
    const content = main.createDiv({ cls: 'notedrop-diff-content' })
    renderEntry(content, active)
  }
}

function collectEntries(diff: {
  added: string[]
  modified: string[]
  removed: string[]
  current: Record<string, PublishedFileSnapshot>
  previous: Record<string, PublishedFileSnapshot> | null
}): DiffEntry[] {
  const entries: DiffEntry[] = []
  for (const path of diff.added) {
    const snap = diff.current[path]!
    entries.push({
      path,
      status: 'added',
      prev: null,
      curr: snap.text,
      prevIsBinary: false,
      currIsBinary: snap.text === null
    })
  }
  for (const path of diff.modified) {
    const before = diff.previous?.[path]
    const after = diff.current[path]!
    entries.push({
      path,
      status: 'modified',
      prev: before?.text ?? null,
      curr: after.text,
      prevIsBinary: before ? before.text === null : false,
      currIsBinary: after.text === null
    })
  }
  for (const path of diff.removed) {
    const before = diff.previous?.[path]
    entries.push({
      path,
      status: 'removed',
      prev: before?.text ?? null,
      curr: null,
      prevIsBinary: before ? before.text === null : false,
      currIsBinary: false
    })
  }
  return entries
}

function statusGlyph(status: FileStatus): string {
  if (status === 'added') return '+'
  if (status === 'removed') return '−'
  return '●'
}

function renderEntry(container: HTMLElement, entry: DiffEntry): void {
  if (entry.prevIsBinary || entry.currIsBinary) {
    container.createDiv({
      cls: 'notedrop-diff-binary',
      text: 'binary file (텍스트 diff 미지원)'
    })
    return
  }
  const prevText = entry.prev ?? ''
  const currText = entry.curr ?? ''
  const hunks = computeHunks(prevText, currText)
  if (hunks.length === 0) {
    container.createDiv({ cls: 'notedrop-diff-empty', text: '변경 없음' })
    return
  }
  for (const hunk of hunks) {
    const hunkEl = container.createDiv({ cls: 'notedrop-diff-hunk' })
    const header = hunkEl.createDiv({ cls: 'notedrop-diff-hunk-header' })
    header.setText(
      `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`
    )
    const rows = hunkEl.createDiv({ cls: 'notedrop-diff-rows' })
    for (const row of hunk.rows) {
      renderRow(rows, row)
    }
  }
}

type Row =
  | { kind: 'context'; oldNum: number; newNum: number; line: string }
  | { kind: 'modified'; oldNum: number; newNum: number; oldLine: string; newLine: string }
  | { kind: 'added'; newNum: number; line: string }
  | { kind: 'removed'; oldNum: number; line: string }

type Hunk = {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  rows: Row[]
}

const CONTEXT_LINES = 3

function computeHunks(oldText: string, newText: string): Hunk[] {
  const parts = Diff.diffLines(oldText, newText)
  const flat: Row[] = []
  let oldNum = 1
  let newNum = 1

  let i = 0
  while (i < parts.length) {
    const part = parts[i]!
    if (!part.added && !part.removed) {
      const lines = splitLines(part.value)
      for (const line of lines) {
        flat.push({ kind: 'context', oldNum, newNum, line })
        oldNum++
        newNum++
      }
      i++
      continue
    }
    if (part.removed && parts[i + 1]?.added) {
      const removedLines = splitLines(part.value)
      const addedLines = splitLines(parts[i + 1]!.value)
      const pairCount = Math.min(removedLines.length, addedLines.length)
      for (let j = 0; j < pairCount; j++) {
        flat.push({
          kind: 'modified',
          oldNum,
          newNum,
          oldLine: removedLines[j]!,
          newLine: addedLines[j]!
        })
        oldNum++
        newNum++
      }
      for (let j = pairCount; j < removedLines.length; j++) {
        flat.push({ kind: 'removed', oldNum, line: removedLines[j]! })
        oldNum++
      }
      for (let j = pairCount; j < addedLines.length; j++) {
        flat.push({ kind: 'added', newNum, line: addedLines[j]! })
        newNum++
      }
      i += 2
      continue
    }
    if (part.removed) {
      for (const line of splitLines(part.value)) {
        flat.push({ kind: 'removed', oldNum, line })
        oldNum++
      }
      i++
      continue
    }
    if (part.added) {
      for (const line of splitLines(part.value)) {
        flat.push({ kind: 'added', newNum, line })
        newNum++
      }
      i++
      continue
    }
    i++
  }

  return groupHunks(flat)
}

function splitLines(text: string): string[] {
  if (text === '') return []
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text
  return trimmed.split('\n')
}

function groupHunks(rows: Row[]): Hunk[] {
  const ranges: { start: number; end: number }[] = []
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.kind === 'context') continue
    const start = Math.max(0, i - CONTEXT_LINES)
    const end = Math.min(rows.length - 1, i + CONTEXT_LINES)
    const last = ranges[ranges.length - 1]
    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end)
    } else {
      ranges.push({ start, end })
    }
  }

  const hunks: Hunk[] = []
  for (const r of ranges) {
    const slice = rows.slice(r.start, r.end + 1)
    let oldStart = 0
    let newStart = 0
    let oldCount = 0
    let newCount = 0
    for (const row of slice) {
      if (row.kind === 'context') {
        if (oldStart === 0) { oldStart = row.oldNum; newStart = row.newNum }
        oldCount++; newCount++
      } else if (row.kind === 'modified') {
        if (oldStart === 0) { oldStart = row.oldNum; newStart = row.newNum }
        oldCount++; newCount++
      } else if (row.kind === 'added') {
        if (newStart === 0) newStart = row.newNum
        newCount++
      } else {
        if (oldStart === 0) oldStart = row.oldNum
        oldCount++
      }
    }
    if (oldStart === 0) oldStart = 1
    if (newStart === 0) newStart = 1
    hunks.push({ oldStart, oldCount, newStart, newCount, rows: slice })
  }
  return hunks
}

function renderRow(parent: HTMLElement, row: Row): void {
  const el = parent.createDiv({ cls: `notedrop-diff-row notedrop-diff-row-${row.kind}` })
  if (row.kind === 'context') {
    appendCell(el, String(row.oldNum), 'lineno')
    appendCell(el, ' ', 'sign')
    appendCell(el, row.line, 'code')
    appendCell(el, String(row.newNum), 'lineno')
    appendCell(el, ' ', 'sign')
    appendCell(el, row.line, 'code')
  } else if (row.kind === 'modified') {
    const wordParts = Diff.diffWordsWithSpace(row.oldLine, row.newLine)
    appendCell(el, String(row.oldNum), 'lineno')
    appendCell(el, '-', 'sign sign-removed')
    appendWordCell(el, wordParts, 'old')
    appendCell(el, String(row.newNum), 'lineno')
    appendCell(el, '+', 'sign sign-added')
    appendWordCell(el, wordParts, 'new')
  } else if (row.kind === 'added') {
    appendCell(el, '', 'lineno')
    appendCell(el, ' ', 'sign')
    appendCell(el, '', 'code')
    appendCell(el, String(row.newNum), 'lineno')
    appendCell(el, '+', 'sign sign-added')
    appendCell(el, row.line, 'code code-added')
  } else {
    appendCell(el, String(row.oldNum), 'lineno')
    appendCell(el, '-', 'sign sign-removed')
    appendCell(el, row.line, 'code code-removed')
    appendCell(el, '', 'lineno')
    appendCell(el, ' ', 'sign')
    appendCell(el, '', 'code')
  }
}

function appendCell(parent: HTMLElement, text: string, kind: string): void {
  const span = parent.createSpan({ cls: `notedrop-diff-${kind.split(' ')[0]}` })
  for (const extra of kind.split(' ').slice(1)) span.addClass(`notedrop-diff-${extra}`)
  span.setText(text === '' ? ' ' : text)
}

function appendWordCell(
  parent: HTMLElement,
  wordParts: Diff.Change[],
  side: 'old' | 'new'
): void {
  const cell = parent.createSpan({ cls: `notedrop-diff-code notedrop-diff-code-${side === 'old' ? 'removed' : 'added'}` })
  for (const part of wordParts) {
    if (side === 'old' && part.added) continue
    if (side === 'new' && part.removed) continue
    if (part.added || part.removed) {
      const mark = cell.createSpan({
        cls: side === 'old' ? 'notedrop-diff-word-removed' : 'notedrop-diff-word-added'
      })
      mark.setText(part.value)
    } else {
      cell.appendText(part.value)
    }
  }
}

export function showPublishDiff(ctx: PluginContext): void {
  if (!ctx.index.list().length) {
    new Notice('notedrop: 공유된 노트가 없습니다')
    return
  }
  new PublishDiffModal(ctx).open()
}

export const showPublishDiffCommand: CommandDef = {
  id: 'show-publish-diff',
  name: 'Show publish diff',
  callback: (ctx) => showPublishDiff(ctx)
}
