import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'
import { publishVaultFromCtx } from '../publishVault.js'
import { forcePublishVaultFromCtx } from '../forcePublishVault.js'

export async function triggerPublishWithTrace(
  ctx: PluginContext,
  mode: 'smart' | 'force'
): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  const t0 = Date.now()
  await ctx.eventLogger.emit('dogfood_publish_started', { mode }, traceId)
  try {
    if (mode === 'smart') await publishVaultFromCtx(ctx)
    else await forcePublishVaultFromCtx(ctx)
    await ctx.eventLogger.emit('dogfood_publish_completed', {
      mode,
      durationMs: Date.now() - t0
    }, traceId)
    new Notice(`notedrop dogfood: ${mode} publish 완료 (trace=${traceId.slice(0, 8)})`, 6000)
  } catch (err) {
    await ctx.eventLogger.emit('dogfood_publish_failed', {
      mode,
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err)
    }, traceId)
    new Notice(`notedrop dogfood: ${mode} publish 실패 — ${err}`, 8000)
  }
}

export const triggerPublishSmartCommand: CommandDef = {
  id: 'dogfood:trigger-publish-smart',
  name: '[dogfood] Trigger smart publish with trace',
  callback: (ctx) => triggerPublishWithTrace(ctx, 'smart')
}

export const triggerPublishForceCommand: CommandDef = {
  id: 'dogfood:trigger-publish-force',
  name: '[dogfood] Trigger force publish with trace',
  callback: (ctx) => triggerPublishWithTrace(ctx, 'force')
}
