import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

export async function dumpState(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  await ctx.eventLogger.emit('dogfood_dump_state_started', {}, traceId)
  const snap = await ctx.devSnapshot()
  await ctx.eventLogger.emit('dogfood_dump_state_completed', { snapshot: snap }, traceId)
  ctx.logger.info('dogfood', 'dump-state 등록', { traceId, baselineFileCount: snap.baselineFileCount })
  new Notice(`notedrop dogfood: state dumped (trace=${traceId.slice(0, 8)})`, 4000)
}

export const dumpStateCommand: CommandDef = {
  id: 'dogfood:dump-state',
  name: '[dogfood] Dump internal state to events.jsonl',
  callback: (ctx) => dumpState(ctx)
}
