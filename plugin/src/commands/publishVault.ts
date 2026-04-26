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
import { isViewerAssetPath } from '../services/PlanFactory.js'
import type { DirtyTracker } from '../services/DirtyTracker.js'
import type { Logger } from '../services/Logger.js'
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
  logger: Logger
  /**
   * publish 성공 후 baseline 갱신 hook. v0.1.46 옵션 B: pushedViewerAsset
   * 이 false 면 lastViewerCacheKey 갱신 안 함 (일반 publish 의 cached entry
   * 케이스 — 실 viewer 자산 push 없음). syncViewerAssets 또는 force publish
   * 만 lastViewerCacheKey 갱신.
   */
  onPublishSuccess?: (options?: {
    force?: boolean
    updateViewerCacheKey?: boolean
  }) => Promise<void>
  /**
   * true 면 변경 감지 (lastPublishedFiles 비교) 우회 + plan.files 전체
   * push. forcePublishVault 가 사용. 일반 publishVault 는 false.
   * PlanFactory 에도 force 로 전파되어 viewer fingerprint cache 무시.
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
    logger: ctx.logger,
    onPublishSuccess: async (options) => {
      const snapshot = await ctx.dirtyTracker.computeSnapshot({
        force: options?.force === true
      })
      await ctx.dirtyTracker.confirmPublished(snapshot, {
        updateViewerCacheKey: options?.updateViewerCacheKey ?? true
      })
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

  const force = deps.skipChangeDetection === true

  deps.logger.info('publish', 'publish 시작', {
    skipChangeDetection: force,
    indexedItemCount: deps.index.list().length,
    targetRepo: settings.targetRepo,
    targetBranch: settings.targetBranch,
    publicRoot: settings.publicRoot,
    publishViewerAssets: settings.publishViewerAssets,
    hasViewerCacheKey: settings.lastViewerCacheKey !== null
  })

  const startNotice = new Notice('notedrop: 발행 준비 중…', 0)
  try {
    const planStart = Date.now()
    const plan = await deps.buildPlan({ force })
    const planDurationMs = Date.now() - planStart
    const totalFileCount = plan.files.length

    const manifestEntries = plan.files.filter((f) => f.path.endsWith('manifest.json'))
    const nojekyllEntries = plan.files.filter((f) => f.path.endsWith('.nojekyll'))
    const contentEntries = plan.files.filter((f) => f.path.includes('/content/') || f.path.startsWith('content/'))
    const cachedEntries = plan.files.filter((f) => f.kind === 'cached')
    deps.logger.info('publish', 'plan 빌드 완료', {
      totalFileCount,
      planDurationMs,
      viewerCacheHit: plan.viewerCacheHit ?? false,
      viewerCacheKeyMatch: plan.viewerCacheKey === settings.lastViewerCacheKey,
      cachedEntryCount: cachedEntries.length,
      manifestEntries: manifestEntries.map((f) => f.path),
      nojekyllEntries: nojekyllEntries.map((f) => f.path),
      contentEntries: contentEntries.map((f) => f.path),
      manifestItemsCount: plan.manifest.items.length,
      manifestItemTypes: plan.manifest.items.map((i) => `${i.type}:${i.title}`),
      warnings: plan.warnings,
      // 모든 path 의 ~30 sample (전체는 너무 길어 first/last 만)
      pathSampleFirst10: plan.files.slice(0, 10).map((f) => f.path),
      pathSampleLast10: plan.files.slice(-10).map((f) => f.path)
    })
    if (manifestEntries.length === 0) {
      deps.logger.error('publish', '⚠️ plan.files 에 manifest.json 이 없음', {
        totalFileCount,
        publicRoot: settings.publicRoot
      })
    }

    // 변경 감지: lastPublishedFiles 와 비교해 변경된 path 만 push.
    // base_tree 가 변경 없는 path 자동 보존이라 blob/tree 등록 회수 절감.
    // force publish (skipChangeDetection=true) 는 일괄 push.
    let pushReason = '변경 감지 우회 (force publish)'
    if (!force) {
      const diffStart = Date.now()
      const diff = await deps.dirtyTracker.computeDiff()
      const diffDurationMs = Date.now() - diffStart
      if (!diff.hasBaseline) {
        pushReason = '첫 publish (baseline 없음 — 일괄 push)'
        deps.logger.info('publish', pushReason, { totalFileCount, diffDurationMs })
      } else {
        const changedPaths = new Set([...diff.added, ...diff.modified])
        // cached entry 는 baseline 의 hash 그대로라 변경 감지 filter 가
        // 자동 변경 없음 분류. 단 isAlwaysPush (manifest/.nojekyll) 가
        // cached 도 강제 push 하면 GitHubPublisher 가 빈 content 만나
        // 오류 — cached 제외 가드.
        const isAlwaysPush = (path: string, kind: string) =>
          kind !== 'cached' && (path.endsWith('manifest.json') || path.endsWith('.nojekyll'))
        const beforeFilter = plan.files.length
        plan.files = plan.files.filter(
          (f) => changedPaths.has(f.path) || isAlwaysPush(f.path, f.kind)
        )
        pushReason = `변경 감지 (added ${diff.added.length}, modified ${diff.modified.length}, removed ${diff.removed.length}, +meta)`
        deps.logger.info('publish', pushReason, {
          beforeFilter,
          afterFilter: plan.files.length,
          diffDurationMs,
          addedPaths: diff.added,
          modifiedPaths: diff.modified,
          removedPaths: diff.removed,
          afterFilterPaths: plan.files.map((f) => f.path)
        })
        if (plan.files.length === totalFileCount && totalFileCount > 10) {
          deps.logger.warn('publish', '모든 파일이 변경됨으로 분류 — baseline mismatch 가능', {
            totalFileCount
          })
          pushReason = 'baseline mismatch — 일괄 push (다음 publish 부터 변경 감지 작동)'
        }
      }
    } else {
      deps.logger.info('publish', '변경 감지 우회 (force) — plan.files 일괄 push', {
        totalFileCount
      })
    }

    if (plan.files.length === 0) {
      startNotice.hide()
      new Notice(
        'notedrop: 변경된 파일 0 — push 안 함 (force publish 면 우회)',
        5000
      )
      return
    }

    // GitHubPublisher 안전 가드: cached entry 가 변경 감지 filter 후
    // 살아남으면 빈 content push 시도 → 오류. 여기서 명시 차단.
    const survivedCached = plan.files.filter((f) => f.kind === 'cached')
    if (survivedCached.length > 0) {
      deps.logger.error('publish', 'cached entry 가 push 대상에 남음 — 차단', {
        cachedPaths: survivedCached.map((f) => f.path)
      })
      startNotice.hide()
      new Notice(
        `notedrop: 내부 오류 — cached entry ${survivedCached.length}개 차단 (Force publish 또는 baseline reset 후 재시도)`,
        8000
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
    deps.logger.info('publish', 'GitHub Tree API 호출 시작', {
      pushFileCount: plan.files.length,
      pushPaths: plan.files.map((f) => f.path)
    })
    const apiStart = Date.now()
    const outcome = await publisher.publish(
      plan,
      `notedrop: publish ${plan.manifest.items.length} item(s) at ${plan.manifest.generatedAt}`
    )
    deps.logger.info('publish', 'GitHub Tree API 완료', {
      commitSha: outcome.commitSha,
      changedFiles: outcome.changedFiles,
      url: outcome.url,
      initialized: outcome.initialized,
      durationMs: Date.now() - apiStart
    })

    startNotice.hide()
    const initSuffix = outcome.initialized ? ' (초기 commit)' : ''
    new Notice(
      `notedrop: 발행 완료${initSuffix} (commit ${outcome.commitSha.slice(0, 7)}, ${outcome.changedFiles}개 파일)`,
      8000
    )
    // v0.1.46 옵션 B: 실 viewer 자산이 push 됐는지 (cached entry 가 아니면)
    // 결정. lastViewerCacheKey 갱신 여부 분기.
    const pushedViewerAsset = plan.files.some(
      (f) => f.kind !== 'cached' && isViewerAssetPath(f.path, settings.publicRoot)
    )
    if (deps.onPublishSuccess) {
      try {
        await deps.onPublishSuccess({
          force,
          updateViewerCacheKey: pushedViewerAsset
        })
      } catch (cbErr) {
        console.warn('onPublishSuccess hook 실패', cbErr)
      }
    }
    // v0.1.46 옵션 B: fingerprint mismatch + viewer 자산 push 안 한 케이스
    // (= 일반 publish 의 cached entry 동작) → 사용자에게 sync 명령어 안내.
    // force publish 는 일괄 push 했으니 mismatch 해소 — Notice 안 띄움.
    if (
      !force
      && !pushedViewerAsset
      && settings.publishViewerAssets
      && plan.viewerCacheKey !== null
      && settings.lastViewerCacheKey !== plan.viewerCacheKey
    ) {
      new Notice(
        'notedrop: viewer 자산 갱신 의무 — Cmd+P 의 "Sync viewer assets" 명령어 실행',
        12000
      )
      deps.logger.info('publish', 'viewer fingerprint mismatch — sync 의무 안내', {
        currentFingerprint: plan.viewerCacheKey,
        baselineFingerprint: settings.lastViewerCacheKey
      })
    }
    if (plan.warnings.length > 0) {
      console.warn('notedrop: warnings', plan.warnings)
      new Notice(`notedrop: ${plan.warnings.length}건 경고 (콘솔 확인)`, 6000)
    }
  } catch (err) {
    startNotice.hide()
    const errorData = {
      name: (err as Error).name,
      message: (err as Error).message,
      stack: (err as Error).stack,
      status: err instanceof GitHubApiError ? err.status : null
    }
    if (err instanceof GitHubAuthError) {
      new Notice('notedrop: GitHub 인증 실패 — PAT 와 권한을 확인하세요', 8000)
      deps.logger.error('publish', 'GitHub 인증 실패', errorData)
    } else if (err instanceof GitHubApiError) {
      const hint = hintFor(err.status)
      new Notice(`notedrop: GitHub API 오류 (${err.status})${hint}`, 10000)
      deps.logger.error('publish', `GitHub API 오류 ${err.status}`, errorData)
    } else {
      new Notice(`notedrop: 발행 실패 — ${(err as Error).message}`, 8000)
      deps.logger.error('publish', '발행 실패', errorData)
    }
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
