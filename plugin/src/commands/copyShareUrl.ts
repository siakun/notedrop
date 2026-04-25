import { Notice } from 'obsidian'
import type { App } from 'obsidian'
import type { PublishIndex } from '../domain/PublishIndex.js'
import type { PluginSettings } from '../settings/PluginSettings.js'

export async function copyShareUrl(
  app: App,
  index: PublishIndex,
  settings: PluginSettings
): Promise<void> {
  const file = app.workspace.getActiveFile()
  if (!file) {
    new Notice('notedrop: 활성 파일이 없습니다')
    return
  }
  const item = index.getByPath(file.path)
  if (!item) {
    new Notice('notedrop: 공유되지 않은 노트입니다')
    return
  }
  if (!settings.shareUrlBase) {
    new Notice('notedrop: 설정에서 Share URL base 를 먼저 지정하세요')
    return
  }
  const slugOrHash = item.slug ?? item.hash
  const url = `${settings.shareUrlBase}/${slugOrHash}`
  await navigator.clipboard.writeText(url)
  new Notice(`복사됨: ${url}`)
}
