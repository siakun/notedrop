import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

export async function resetBaseline(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  const baselineFileCountBefore = ctx.settings.lastPublishedFiles
    ? Object.keys(ctx.settings.lastPublishedFiles).length : 0
  ctx.settings.lastPublishedDigest = null
  ctx.settings.lastPublishedFiles = null
  ctx.settings.lastViewerCacheKey = null
  ctx.settings.unpublishedChanges = true
  await ctx.saveSettings()
  await ctx.eventLogger.emit('dogfood_reset_baseline_completed', {
    baselineFileCountBefore
  }, traceId)
  new Notice(`notedrop dogfood: baseline reset (was ${baselineFileCountBefore} files)`, 6000)
}

export const resetBaselineCommand: CommandDef = {
  id: 'dogfood:reset-baseline',
  name: '[dogfood] Reset publish baseline (next publish = full push)',
  callback: (ctx) => resetBaseline(ctx)
}
