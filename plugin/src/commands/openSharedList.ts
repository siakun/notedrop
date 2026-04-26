import { Modal, Notice } from 'obsidian'
import type { App, TFile } from 'obsidian'
import type { PublishIndex } from '../domain/PublishIndex.js'

class SharedListModal extends Modal {
  constructor(app: App, private index: PublishIndex) {
    super(app)
  }

  override onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: 'Notedrop · 공유된 노트' })

    const items = this.index.list()
    if (items.length === 0) {
      contentEl.createEl('p', { text: '아직 공유된 노트가 없습니다.' })
      return
    }

    const list = contentEl.createEl('ul')
    for (const item of items) {
      const li = list.createEl('li')
      const link = li.createEl('a', {
        text: `${item.title}  (${item.render})`
      })
      link.addEventListener('click', async (e) => {
        e.preventDefault()
        const file = this.app.vault.getAbstractFileByPath(item.filePath)
        if (!file) {
          new Notice(`파일 없음: ${item.filePath}`)
          return
        }
        await this.app.workspace.getLeaf().openFile(file as TFile)
        this.close()
      })
      li.createEl('span', { text: `   ${item.filePath}` })
    }
  }

  override onClose(): void {
    this.contentEl.empty()
  }
}

export function openSharedList(app: App, index: PublishIndex): void {
  new SharedListModal(app, index).open()
}

import type { CommandDef } from './types.js'

export const openSharedListCommand: CommandDef = {
  id: 'open-shared-list',
  name: 'Open shared list',
  callback: (ctx) => openSharedList(ctx.app, ctx.index)
}
