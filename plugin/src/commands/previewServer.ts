import { Notice } from 'obsidian'
import type { App } from 'obsidian'
import type { PreviewServer } from '../infrastructure/PreviewServer.js'
import type { CommandDef } from './types.js'

export async function startPreviewServer(
  _app: App,
  server: PreviewServer
): Promise<void> {
  try {
    const status = await server.start()
    if (status.state === 'running') {
      new Notice(`notedrop preview: ${status.url}`, 6000)
    }
  } catch (err) {
    new Notice(`notedrop preview start 실패: ${(err as Error).message}`, 8000)
  }
}

export async function stopPreviewServer(
  _app: App,
  server: PreviewServer
): Promise<void> {
  await server.stop()
  new Notice('notedrop preview 중지', 4000)
}

export async function openPreviewInBrowser(
  _app: App,
  server: PreviewServer
): Promise<void> {
  let status = server.getStatus()
  if (status.state !== 'running') {
    try {
      status = await server.start()
    } catch (err) {
      new Notice(`notedrop preview start 실패: ${(err as Error).message}`, 8000)
      return
    }
  }
  if (status.state !== 'running') {
    new Notice('notedrop preview 시작 안 됨', 6000)
    return
  }
  window.open(status.url, '_blank')
}

export const startPreviewCommand: CommandDef = {
  id: 'start-preview',
  name: 'Start preview server',
  callback: (ctx) => startPreviewServer(ctx.app, ctx.preview)
}

export const stopPreviewCommand: CommandDef = {
  id: 'stop-preview',
  name: 'Stop preview server',
  callback: (ctx) => stopPreviewServer(ctx.app, ctx.preview)
}

export const openPreviewCommand: CommandDef = {
  id: 'open-preview',
  name: 'Open preview in browser',
  callback: (ctx) => openPreviewInBrowser(ctx.app, ctx.preview)
}
