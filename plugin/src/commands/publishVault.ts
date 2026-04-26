import { Notice } from 'obsidian'
import type { App } from 'obsidian'
import type { VaultFs } from '../ports/VaultFs.js'
import type { PublishIndex } from '../domain/PublishIndex.js'
import type { PluginSettings } from '../settings/PluginSettings.js'
import {
  GitHubPublisher,
  GitHubAuthError,
  GitHubApiError
} from '../infrastructure/GitHubPublisher.js'
import type { PluginContext } from '../services/PluginContext.js'
import type { PlanFactory } from '../services/PlanFactory.js'
import type { DirtyTracker } from '../services/DirtyTracker.js'
import type { CommandDef } from './types.js'

/**
 * publish 핵심 의존. main.ts (또는 buildPublishDeps) 가 ctx 에서 추출하여
 * 주입. domain/infra 인스턴스 직접 노출 없음 — service 만 받음.
 */
export type PublishDeps = {
  app: App
  vault: VaultFs
  index: PublishIndex
  buildPlan: PlanFactory
  dirtyTracker: DirtyTracker
  onPublishSuccess?: () => Promise<void>
  /**
   * true 면 변경 감지 (lastPublishedFiles 비교) 우회 + plan.files 전체
   * push. forcePublishVault 가 사용. 일반 publishVault 는 false.
   */
  skipChangeDetection?: boolean
}

export type PublishGate = {
  isDirty: () => Promise<boolean>
}

/**
 * smart publish — dirty 게이트 통과 시에만 실제 publish.
 */
export async function publishVault(
  deps: PublishDeps,
  settings: PluginSettings,
  gate: PublishGate
): Promise<void> {
  const dirty = await gate.isDirty()
  if (!dirty) {
    new Notice(
      'notedrop: 변경 사항이 없습니다 — 발행 안 함 (강제 발행은 Force publish 명령어)',
      5000
    )
    return
  }
  await executePublish(deps, settings)
}

export const publishVaultCommand: CommandDef = {
  id: 'publish-vault',
  name: 'Publish vault to GitHub',
  callback: (ctx) =>
    publishVault(buildPublishDeps(ctx), ctx.settings, {
      isDirty: () => ctx.dirtyTracker.revalidate()
    })
}

/**
 * commands 가 PluginContext 에서 publish 의존을 추출하는 헬퍼.
 */
export function buildPublishDeps(ctx: PluginContext): PublishDeps {
  return {
    app: ctx.app,
    vault: ctx.vault,
    index: ctx.index,
    buildPlan: ctx.buildPlan,
    dirtyTracker: ctx.dirtyTracker,
    onPublishSuccess: async () => {
      const snapshot = await ctx.dirtyTracker.computeSnapshot()
      await ctx.dirtyTracker.confirmPublished(snapshot)
    }
  }
}

/**
 * 핵심 publish 실행. 게이트 없음. forcePublishVault 와 publishVault 양쪽이
 * 공유. 외부 호출자는 publishVault (smart) 또는 forcePublishVault (force)
 * 만 사용.
 */
export async function executePublish(
  deps: PublishDeps,
  settings: PluginSettings
): Promise<void> {
  if (!settings.githubPat) {
    new Notice('notedrop: 설정에서 GitHub PAT 를 먼저 입력하세요')
    return
  }
  if (!settings.targetRepo) {
    new Notice('notedrop: 설정에서 target repository 를 먼저 입력하세요')
    return
  }
  if (deps.index.list().length === 0) {
    new Notice('notedrop: 공유된 노트가 없습니다')
    return
  }

  const startNotice = new Notice('notedrop: 발행 준비 중…', 0)
  try {
    const plan = await deps.buildPlan()
    const totalFileCount = plan.files.length

    // 변경 감지: lastPublishedFiles 와 비교해 변경된 path 만 push.
    // base_tree 가 변경 없는 path 자동 보존이라 blob/tree 등록 회수 절감.
    // force publish (skipChangeDetection=true) 는 일괄 push.
    let pushReason = '변경 감지 우회 (force publish)'
    if (!deps.skipChangeDetection) {
      const diff = await deps.dirtyTracker.computeDiff()
      if (!diff.hasBaseline) {
        pushReason = '첫 publish (baseline 없음 — 일괄 push)'
        console.log(
          `notedrop publish: ${pushReason}. files=${totalFileCount}`
        )
      } else {
        const changedPaths = new Set([...diff.added, ...diff.modified])
        // Meta 파일 (manifest.json, .nojekyll) 은 항상 push.
        // 사유: dirtyTracker 는 plugin 내부 record 를 비교하지 share repo
        // 의 실제 상태를 모름. 어느 시점에 publish 가 fail 했지만 baseline
        // 에는 등록된 케이스 — manifest 가 plugin 과 share repo 사이 mismatch
        // 인데도 변경 감지가 "변경 없음" 으로 분류 → 영구히 안 push 되는 버그.
        // manifest 는 ~수 KB 라 매번 push 부담 없음.
        const isAlwaysPush = (path: string) =>
          path.endsWith('manifest.json') || path.endsWith('.nojekyll')
        plan.files = plan.files.filter(
          (f) => changedPaths.has(f.path) || isAlwaysPush(f.path)
        )
        pushReason = `변경 감지 (added ${diff.added.length}, modified ${diff.modified.length}, removed ${diff.removed.length}, +meta)`
        console.log(
          `notedrop publish: ${pushReason}. files=${plan.files.length}/${totalFileCount}`
        )
        if (plan.files.length === totalFileCount && totalFileCount > 10) {
          console.warn(
            'notedrop publish: 모든 파일이 변경됨으로 분류 — baseline mismatch 가능 ' +
            '(plugin update 또는 settings 변경 후 첫 publish?). 본 publish 후 baseline 갱신되어 ' +
            '다음 publish 부터 변경된 파일만 push.'
          )
          pushReason = 'baseline mismatch — 일괄 push (다음 publish 부터 변경 감지 작동)'
        }
      }
    }

    if (plan.files.length === 0) {
      startNotice.hide()
      new Notice(
        'notedrop: 변경된 파일 0 — push 안 함 (force publish 면 우회)',
        5000
      )
      return
    }

    startNotice.setMessage(
      plan.files.length === totalFileCount
        ? `notedrop: ${plan.files.length} 파일 push 중 — ${pushReason}`
        : `notedrop: ${plan.files.length}/${totalFileCount} 파일 변경됨, push 중`
    )

    const publisher = new GitHubPublisher({
      repo: settings.targetRepo,
      branch: settings.targetBranch,
      token: settings.githubPat
    })
    const outcome = await publisher.publish(
      plan,
      `notedrop: publish ${plan.manifest.items.length} item(s) at ${plan.manifest.generatedAt}`
    )

    startNotice.hide()
    const initSuffix = outcome.initialized ? ' (초기 commit)' : ''
    new Notice(
      `notedrop: 발행 완료${initSuffix} (commit ${outcome.commitSha.slice(0, 7)}, ${outcome.changedFiles}개 파일)`,
      8000
    )
    if (deps.onPublishSuccess) {
      try {
        await deps.onPublishSuccess()
      } catch (cbErr) {
        console.warn('onPublishSuccess hook 실패', cbErr)
      }
    }
    if (plan.warnings.length > 0) {
      console.warn('notedrop: warnings', plan.warnings)
      new Notice(`notedrop: ${plan.warnings.length}건 경고 (콘솔 확인)`, 6000)
    }
  } catch (err) {
    startNotice.hide()
    if (err instanceof GitHubAuthError) {
      new Notice('notedrop: GitHub 인증 실패 — PAT 와 권한을 확인하세요', 8000)
    } else if (err instanceof GitHubApiError) {
      const hint = hintFor(err.status)
      new Notice(`notedrop: GitHub API 오류 (${err.status})${hint}`, 10000)
    } else {
      new Notice(`notedrop: 발행 실패 — ${(err as Error).message}`, 8000)
    }
    console.error('notedrop publish failed', err)
  }
}

function hintFor(status: number): string {
  switch (status) {
    case 404:
      return ' — 레포·브랜치 이름 확인'
    case 422:
      return ' — 빈 repo·잘못된 input·rate limit 가능'
    case 409:
      return ' — repo 빈 상태 또는 충돌'
    default:
      return ''
  }
}
