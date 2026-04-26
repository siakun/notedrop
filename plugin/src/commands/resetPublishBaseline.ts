import { Notice } from 'obsidian'
import type { PluginContext } from '../services/PluginContext.js'
import type { CommandDef } from './types.js'

/**
 * Publish baseline (lastPublishedFiles + lastPublishedDigest) 초기화.
 *
 * 사용처: dirtyTracker 의 baseline 이 share repo 의 실제 상태와 mismatch
 * 났을 때. 예:
 * - plugin 이 publish 성공 후 baseline 저장됐지만 push 자체는 422 등으로 fail
 * - share repo 가 외부 (다른 도구·다른 컴퓨터) 에서 수정됨
 * - GitHub repo 전체 reset 또는 force-push 됨
 *
 * Reset 후 다음 publish 가 baseline 없는 상태 (일괄 push) 로 진행 → push
 * 성공 후 baseline 새로 기록. 즉 share repo 와 baseline 동기화 회복.
 *
 * 일반 publish 후에도 baseline 이 정상이면 이 명령어 사용 의무 없음.
 */
export async function resetPublishBaseline(ctx: PluginContext): Promise<void> {
  const hadBaseline = ctx.settings.lastPublishedDigest !== null
    || ctx.settings.lastPublishedFiles !== null
    || ctx.settings.lastViewerCacheKey !== null
  ctx.settings.lastPublishedDigest = null
  ctx.settings.lastPublishedFiles = null
  ctx.settings.lastViewerCacheKey = null
  ctx.settings.unpublishedChanges = true
  await ctx.saveSettings()
  if (hadBaseline) {
    new Notice(
      'notedrop: publish baseline 초기화. 다음 publish 가 일괄 push 후 baseline 새로 기록',
      6000
    )
  } else {
    new Notice('notedrop: 이미 baseline 없음 (변경 X)', 4000)
  }
}

export const resetPublishBaselineCommand: CommandDef = {
  id: 'reset-publish-baseline',
  name: 'Reset publish baseline (share repo 와 mismatch 회복)',
  callback: (ctx) => resetPublishBaseline(ctx)
}
