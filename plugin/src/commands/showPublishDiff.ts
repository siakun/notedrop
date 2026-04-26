import { Modal, Notice } from 'obsidian'
import type { App } from 'obsidian'
import type NotedropPlugin from '../main.js'

class PublishDiffModal extends Modal {
  constructor(app: App, private plugin: NotedropPlugin) {
    super(app)
  }

  override async onOpen(): Promise<void> {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: '발행 변경 사항' })
    const status = contentEl.createEl('p', { text: '계산 중…' })

    let diff
    try {
      diff = await this.plugin.computePublishDiff()
    } catch (err) {
      status.setText(`계산 실패: ${(err as Error).message}`)
      return
    }
    status.remove()

    const summary = contentEl.createEl('p')
    if (!diff.hasBaseline) {
      summary.setText(
        `최초 발행 (비교 대상 없음). ${diff.added.length}개 파일이 push 됩니다.`
      )
    } else {
      const total = diff.added.length + diff.modified.length + diff.removed.length
      if (total === 0) {
        summary.setText('변경 사항 없음 (마지막 발행 이후 의미적 변경 0건).')
      } else {
        summary.setText(
          `추가 ${diff.added.length} · 수정 ${diff.modified.length} · 삭제 ${diff.removed.length} (총 ${total}개 파일)`
        )
      }
    }

    if (diff.added.length > 0) renderSection(contentEl, '추가', diff.added, 'added')
    if (diff.modified.length > 0) renderSection(contentEl, '수정', diff.modified, 'modified')
    if (diff.removed.length > 0) renderSection(contentEl, '삭제', diff.removed, 'removed')

    if (diff.hasBaseline && diff.added.length === 0 && diff.modified.length === 0 && diff.removed.length === 0) {
      contentEl.createEl('p', {
        text: '※ updatedAt/generatedAt timestamp 만 다른 경우 변경으로 보지 않습니다 (의미적 비교).'
      }).style.color = 'var(--text-muted)'
    }
  }

  override onClose(): void {
    this.contentEl.empty()
  }
}

function renderSection(
  parent: HTMLElement,
  title: string,
  paths: string[],
  kind: 'added' | 'modified' | 'removed'
): void {
  const heading = parent.createEl('h3', { text: `${title} (${paths.length})` })
  const colors: Record<typeof kind, string> = {
    added: 'var(--color-green)',
    modified: 'var(--color-yellow)',
    removed: 'var(--color-red)'
  }
  heading.style.color = colors[kind]
  const list = parent.createEl('ul')
  for (const path of paths) {
    const li = list.createEl('li')
    const code = li.createEl('code')
    code.setText(path)
  }
}

export function showPublishDiff(app: App, plugin: NotedropPlugin): void {
  if (!plugin.indexList().length) {
    new Notice('notedrop: 공유된 노트가 없습니다')
    return
  }
  new PublishDiffModal(app, plugin).open()
}
