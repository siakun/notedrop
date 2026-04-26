import { Notice } from 'obsidian'
import type { App, TFile } from 'obsidian'
import type { PublishIndex } from '../domain/PublishIndex.js'
import type { CommandDef } from './types.js'

export async function unshareNote(
  app: App,
  index: PublishIndex
): Promise<void> {
  const file = app.workspace.getActiveFile()
  if (!file || file.extension !== 'md') {
    new Notice('notedrop: 활성 마크다운 파일이 없습니다')
    return
  }
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    fm['notedrop-publish'] = false
  })
  index.remove(file.path)
  new Notice(`notedrop: "${(file as TFile).basename}" 공유 해제됨`)
}

export const unshareNoteCommand: CommandDef = {
  id: 'unshare-note',
  name: 'Unshare this note',
  callback: (ctx) => unshareNote(ctx.app, ctx.index)
}
