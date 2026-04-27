import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

export async function exportBaseline(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  const files = ctx.settings.lastPublishedFiles ?? {}
  // 전체 dump (수십 KB 가능). 호출자가 의도적으로 호출
  await ctx.eventLogger.emit('dogfood_export_baseline_completed', {
    digest: ctx.settings.lastPublishedDigest,
    fileCount: Object.keys(files).length,
    files: Object.fromEntries(
      Object.entries(files).map(([p, snap]) => [p, { hash: snap.hash, hasText: snap.text !== null }])
    )
  }, traceId)
  new Notice(`notedrop dogfood: baseline exported ${Object.keys(files).length} files (trace=${traceId.slice(0, 8)})`, 4000)
}

export const exportBaselineCommand: CommandDef = {
  id: 'dogfood:export-baseline',
  name: '[dogfood] Export baseline file mapping to events.jsonl',
  callback: (ctx) => exportBaseline(ctx)
}
