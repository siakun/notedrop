import { Notice } from 'obsidian'
import type { App, TFile } from 'obsidian'
import type { PublishIndex } from '../domain/PublishIndex.js'

export async function shareNote(
  app: App,
  index: PublishIndex
): Promise<void> {
  const file = app.workspace.getActiveFile()
  if (!file || file.extension !== 'md') {
    new Notice('notedrop: 활성 마크다운 파일이 없습니다')
    return
  }
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    fm['notedrop-publish'] = true
  })
  index.upsert(file.path)
  new Notice(`notedrop: "${(file as TFile).basename}" 공유됨`)
}
