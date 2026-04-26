import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

export async function resetCache(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  const before = ctx.settings.lastViewerCacheKey
  ctx.settings.lastViewerCacheKey = null
  await ctx.saveSettings()
  await ctx.eventLogger.emit('dogfood_reset_cache_completed', {
    previousKey: before ? before.slice(0, 16) + '…' : null
  }, traceId)
  new Notice(`notedrop dogfood: cache key reset (trace=${traceId.slice(0, 8)})`, 4000)
}

export const resetCacheCommand: CommandDef = {
  id: 'dogfood:reset-cache',
  name: '[dogfood] Reset viewer cache key (force cache miss)',
  callback: (ctx) => resetCache(ctx)
}
