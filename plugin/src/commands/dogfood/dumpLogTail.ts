import { Notice } from 'obsidian'
import type { FileSystemAdapter } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

const TAIL_LINES = 100

export async function dumpLogTail(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  const adapter = ctx.app.vault.adapter as FileSystemAdapter
  const logRelPath = '.obsidian/plugins/notedrop/notedrop.log'
  let tail = ''
  try {
    const exists = await adapter.exists(logRelPath)
    if (exists) {
      const content = await adapter.read(logRelPath)
      tail = content.split('\n').slice(-TAIL_LINES).join('\n')
    }
  } catch (err) {
    await ctx.eventLogger.emit('dogfood_dump_log_tail_failed', {
      error: err instanceof Error ? err.message : String(err)
    }, traceId)
    new Notice('notedrop dogfood: log tail dump 실패', 4000)
    return
  }
  await ctx.eventLogger.emit('dogfood_dump_log_tail_completed', {
    tailLineCount: tail.split('\n').length,
    tail
  }, traceId)
  new Notice(`notedrop dogfood: log tail dumped (${TAIL_LINES} lines)`, 4000)
}

export const dumpLogTailCommand: CommandDef = {
  id: 'dogfood:dump-log-tail',
  name: '[dogfood] Dump notedrop.log tail to events.jsonl',
  callback: (ctx) => dumpLogTail(ctx)
}
