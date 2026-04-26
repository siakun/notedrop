import { Notice } from 'obsidian'
import type { PluginSettings } from '../settings/PluginSettings.js'
import {
  buildPublishDeps,
  executePublish,
  type PublishDeps
} from './publishVault.js'
import type { CommandDef } from './types.js'

/**
 * Force publish — dirty 게이트 우회. 변경 없어도 무조건 publish.
 *
 * 사용처:
 * - share repo 의 stale 자산 (vanilla 마이그레이션 잔재 등) 정리 후 강제 갱신
 * - 외부 협업자가 share repo 를 수동 수정한 후 본 vault 기준 재동기
 * - 의도된 강제 publish (디지스트가 정확히 같지만 push 로 새 commit 만들고 싶을 때)
 *
 * 일반 publish 는 publishVault (smart) 를 사용. force 는 명시적 명령어로만.
 */
export async function forcePublishVault(
  deps: PublishDeps,
  settings: PluginSettings
): Promise<void> {
  new Notice('notedrop: Force publish — dirty + 변경 감지 모두 우회', 4000)
  await executePublish({ ...deps, skipChangeDetection: true }, settings)
}

export const forcePublishVaultCommand: CommandDef = {
  id: 'force-publish-vault',
  name: 'Force publish vault to GitHub (변경 없어도 강제)',
  callback: (ctx) => forcePublishVault(buildPublishDeps(ctx), ctx.settings)
}
