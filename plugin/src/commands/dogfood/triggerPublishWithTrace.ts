import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { PublishResult } from '../publishVault.js'
import type { CommandDef } from '../types.js'
import { publishVaultFromCtx } from '../publishVault.js'
import { forcePublishVaultFromCtx } from '../forcePublishVault.js'

export type PublishTraceRunners = {
  smart: (ctx: PluginContext) => Promise<PublishResult>
  force: (ctx: PluginContext) => Promise<PublishResult>
}

const DEFAULT_RUNNERS: PublishTraceRunners = {
  smart: publishVaultFromCtx,
  force: forcePublishVaultFromCtx
}

export async function triggerPublishWithTrace(
  ctx: PluginContext,
  mode: 'smart' | 'force',
  runners: PublishTraceRunners = DEFAULT_RUNNERS
): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  const t0 = Date.now()
  await ctx.eventLogger.emit('dogfood_publish_started', { mode }, traceId)
  try {
    const result = mode === 'smart'
      ? await runners.smart(ctx)
      : await runners.force(ctx)
    const durationMs = Date.now() - t0

    if (result.status === 'published') {
      await ctx.eventLogger.emit('dogfood_publish_completed', {
        mode,
        durationMs,
        commitSha: result.commitSha,
        changedFiles: result.changedFiles,
        initialized: result.initialized,
        pushedViewerAsset: result.pushedViewerAsset,
        warningCount: result.warningCount
      }, traceId)
      new Notice(`notedrop dogfood: ${mode} publish complete (trace=${traceId.slice(0, 8)})`, 6000)
      return
    }

    if (result.status === 'skipped') {
      await ctx.eventLogger.emit('dogfood_publish_skipped', {
        mode,
        durationMs,
        reason: result.reason
      }, traceId)
      new Notice(`notedrop dogfood: ${mode} publish skipped (${result.reason})`, 6000)
      return
    }

    await ctx.eventLogger.emit('dogfood_publish_failed', {
      mode,
      durationMs,
      reason: result.reason,
      error: result.error,
      statusCode: result.statusCode ?? null
    }, traceId)
    new Notice(`notedrop dogfood: ${mode} publish failed - ${result.error}`, 8000)
  } catch (err) {
    await ctx.eventLogger.emit('dogfood_publish_failed', {
      mode,
      durationMs: Date.now() - t0,
      reason: 'exception',
      error: err instanceof Error ? err.message : String(err)
    }, traceId)
    new Notice(`notedrop dogfood: ${mode} publish failed - ${err}`, 8000)
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
