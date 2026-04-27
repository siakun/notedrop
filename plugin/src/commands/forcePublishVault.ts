import { Notice } from 'obsidian'
import type { PluginSettings } from '../settings/PluginSettings.js'
import {
  buildPublishDeps,
  executePublish,
  type PublishDeps,
  type PublishResult
} from './publishVault.js'
import type { CommandDef } from './types.js'
import type { PluginContext } from '../services/PluginContext.js'

export async function forcePublishVault(
  deps: PublishDeps,
  settings: PluginSettings
): Promise<PublishResult> {
  new Notice('notedrop: Force publish - dirty와 변경 감지를 모두 우회합니다', 4000)
  return executePublish({ ...deps, skipChangeDetection: true }, settings)
}

export const forcePublishVaultCommand: CommandDef = {
  id: 'force-publish-vault',
  name: 'Force publish vault to GitHub (변경 없어도 강제)',
  callback: async (ctx) => {
    await forcePublishVault(buildPublishDeps(ctx), ctx.settings)
  }
}

export async function forcePublishVaultFromCtx(
  ctx: PluginContext
): Promise<PublishResult> {
  return forcePublishVault(buildPublishDeps(ctx), ctx.settings)
}
