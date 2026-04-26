import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

/**
 * share repo 의 _next/static/<buildId>/ 디렉토리 중 manifest 에 등록된
 * 현재 buildId 외 모두 cleanup. GitHub Tree API 의 sha=null 적용으로
 * file 삭제. 단일 atomic commit.
 *
 * 위험 ↑↑: share repo 손상 가능. 사용자 manual confirm 의무.
 *
 * 현재 STUB — GitHubPublisher 확장 의무라 후속 plan.
 */
export async function cleanupStaleBuildId(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  await ctx.eventLogger.emit('dogfood_cleanup_started', {}, traceId)
  new Notice('notedrop dogfood: cleanup-stale-buildid not yet implemented (stub)', 6000)
  await ctx.eventLogger.emit('dogfood_cleanup_skipped', { reason: 'not_implemented' }, traceId)
}

export const cleanupStaleBuildIdCommand: CommandDef = {
  id: 'dogfood:cleanup-stale-buildid',
  name: '[dogfood] Cleanup stale buildId in share repo (DANGER, stub)',
  callback: (ctx) => cleanupStaleBuildId(ctx)
}
