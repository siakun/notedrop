import { Notice } from 'obsidian'
import type { App } from 'obsidian'
import type { PublishIndex } from '../domain/PublishIndex.js'
import type { PluginSettings } from '../settings/PluginSettings.js'
import { resolveShareUrlBase } from '../settings/shareUrl.js'
import type { CommandDef } from './types.js'

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
  const base = resolveShareUrlBase(settings)
  if (!base) {
    new Notice('notedrop: target repo 또는 share URL base 가 필요합니다')
    return
  }
  const slugOrHash = item.slug ?? item.hash
  const url = `${base}/#/${slugOrHash}/`
  await navigator.clipboard.writeText(url)
  new Notice(`복사됨: ${url}`)
}

export const copyShareUrlCommand: CommandDef = {
  id: 'copy-share-url',
  name: 'Copy share URL',
  callback: (ctx) => copyShareUrl(ctx.app, ctx.index, ctx.settings)
}
