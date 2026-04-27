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
import {
  checkViewerFingerprintMismatch,
  VIEWER_SYNC_NOTICE_MESSAGE,
  VIEWER_SYNC_NOTICE_TIMEOUT_MS
} from '../services/ViewerSyncCheck.js'
import type { CommandDef } from './types.js'

export type PublishDeps = {
  app: App
  vault: VaultFs
  index: PublishIndex
  buildPlan: PlanFactory
  dirtyTracker: DirtyTracker
  logger: Logger
  onPublishSuccess?: (options?: {
    force?: boolean
    updateViewerCacheKey?: boolean
  }) => Promise<void>
  skipChangeDetection?: boolean
}

export type PublishGate = {
  isDirty: () => Promise<boolean>
}

export type PublishSkipReason =
  | 'not_dirty'
  | 'missing_pat'
  | 'missing_target_repo'
  | 'empty_index'
  | 'no_files'

export type PublishFailureReason =
  | 'auth'
  | 'api'
  | 'cached_entry_blocked'
  | 'unknown'

export type PublishResult =
  | {
      status: 'published'
      commitSha: string
      changedFiles: number
      initialized: boolean
      pushedViewerAsset: boolean
      warningCount: number
    }
  | {
      status: 'skipped'
      reason: PublishSkipReason
    }
  | {
      status: 'failed'
      reason: PublishFailureReason
      error: string
      statusCode?: number
    }

export async function publishVault(
  deps: PublishDeps,
  settings: PluginSettings,
  gate: PublishGate
): Promise<PublishResult> {
  const dirty = await gate.isDirty()
  if (!dirty) {
    // v0.1.48: dirty=false 라도 viewer fingerprint mismatch 시 sync 의무
    // 안내. 옵션 B 의 누락 대안 — 사용자가 plugin update 후 노트 변경 0 인
    // 상태로 publish 진행 케이스에서 sync 의무 영구 미인지 fix.
    const syncCheck = checkViewerFingerprintMismatch(settings)
    if (syncCheck.needsSync) {
      new Notice(VIEWER_SYNC_NOTICE_MESSAGE, VIEWER_SYNC_NOTICE_TIMEOUT_MS)
      deps.logger.info(
        'publish',
        'dirty=false but viewer fingerprint mismatch; sync required',
        {
          currentFingerprint: syncCheck.currentFingerprint,
          baselineFingerprint: syncCheck.baselineFingerprint
        }
      )
    } else {
      new Notice(
        'notedrop: 변경 사항이 없습니다. 강제 발행은 Force publish 명령을 사용하세요.',
        5000
      )
    }
    return { status: 'skipped', reason: 'not_dirty' }
  }
  return executePublish(deps, settings)
}

export const publishVaultCommand: CommandDef = {
  id: 'publish-vault',
  name: 'Publish vault to GitHub',
  callback: async (ctx) => {
    await publishVault(buildPublishDeps(ctx), ctx.settings, {
      isDirty: () => ctx.dirtyTracker.revalidate()
    })
  }
}

export async function publishVaultFromCtx(
  ctx: PluginContext
): Promise<PublishResult> {
  return publishVault(buildPublishDeps(ctx), ctx.settings, {
    isDirty: () => ctx.dirtyTracker.revalidate()
  })
}

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

export async function executePublish(
  deps: PublishDeps,
  settings: PluginSettings
): Promise<PublishResult> {
  if (!settings.githubPat) {
    new Notice('notedrop: 설정에서 GitHub PAT를 먼저 입력하세요')
    return { status: 'skipped', reason: 'missing_pat' }
  }
  if (!settings.targetRepo) {
    new Notice('notedrop: 설정에서 target repository를 먼저 입력하세요')
    return { status: 'skipped', reason: 'missing_target_repo' }
  }
  if (deps.index.list().length === 0) {
    new Notice('notedrop: 공유된 노트가 없습니다')
    return { status: 'skipped', reason: 'empty_index' }
  }

  const force = deps.skipChangeDetection === true

  deps.logger.info('publish', 'publish started', {
    skipChangeDetection: force,
    indexedItemCount: deps.index.list().length,
    targetRepo: settings.targetRepo,
    targetBranch: settings.targetBranch,
    publicRoot: settings.publicRoot,
    publishViewerAssets: settings.publishViewerAssets,
    hasViewerCacheKey: settings.lastViewerCacheKey !== null
  })

  const startNotice = new Notice('notedrop: 발행 준비 중...', 0)
  try {
    const planStart = Date.now()
    const plan = await deps.buildPlan({ force })
    const planDurationMs = Date.now() - planStart
    const totalFileCount = plan.files.length

    const manifestEntries = plan.files.filter((f) => f.path.endsWith('manifest.json'))
    const nojekyllEntries = plan.files.filter((f) => f.path.endsWith('.nojekyll'))
    const contentEntries = plan.files.filter((f) => f.path.includes('/content/') || f.path.startsWith('content/'))
    const cachedEntries = plan.files.filter((f) => f.kind === 'cached')
    deps.logger.info('publish', 'plan built', {
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
      pathSampleFirst10: plan.files.slice(0, 10).map((f) => f.path),
      pathSampleLast10: plan.files.slice(-10).map((f) => f.path)
    })
    if (manifestEntries.length === 0) {
      deps.logger.error('publish', 'plan.files is missing manifest.json', {
        totalFileCount,
        publicRoot: settings.publicRoot
      })
    }

    let pushReason = 'force publish bypassed change detection'
    if (!force) {
      const diffStart = Date.now()
      const diff = await deps.dirtyTracker.computeDiff()
      const diffDurationMs = Date.now() - diffStart
      if (!diff.hasBaseline) {
        pushReason = 'first publish without baseline'
        deps.logger.info('publish', pushReason, { totalFileCount, diffDurationMs })
      } else {
        const changedPaths = new Set([...diff.added, ...diff.modified])
        const isAlwaysPush = (path: string, kind: string) =>
          kind !== 'cached' && (path.endsWith('manifest.json') || path.endsWith('.nojekyll'))
        const beforeFilter = plan.files.length
        plan.files = plan.files.filter(
          (f) => changedPaths.has(f.path) || isAlwaysPush(f.path, f.kind)
        )
        pushReason = `change detection: added ${diff.added.length}, modified ${diff.modified.length}, removed ${diff.removed.length}, plus meta`
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
          deps.logger.warn('publish', 'all files classified as changed; baseline mismatch possible', {
            totalFileCount
          })
          pushReason = 'baseline mismatch likely; pushing full plan'
        }
      }
    } else {
      deps.logger.info('publish', 'force publish pushes the full plan', {
        totalFileCount
      })
    }

    if (plan.files.length === 0) {
      startNotice.hide()
      new Notice('notedrop: 변경된 파일이 없어 push하지 않습니다', 5000)
      return { status: 'skipped', reason: 'no_files' }
    }

    const survivedCached = plan.files.filter((f) => f.kind === 'cached')
    if (survivedCached.length > 0) {
      deps.logger.error('publish', 'cached entries remained in push plan; blocking publish', {
        cachedPaths: survivedCached.map((f) => f.path)
      })
      startNotice.hide()
      new Notice(
        `notedrop: 내부 오류 - cached publish entry ${survivedCached.length}개 차단`,
        8000
      )
      return {
        status: 'failed',
        reason: 'cached_entry_blocked',
        error: `cached entry ${survivedCached.length} remained in publish plan`
      }
    }

    startNotice.setMessage(
      plan.files.length === totalFileCount
        ? `notedrop: ${plan.files.length}개 파일 push 중 (${pushReason})`
        : `notedrop: ${plan.files.length}/${totalFileCount}개 변경 파일 push 중`
    )

    const publisher = new GitHubPublisher({
      repo: settings.targetRepo,
      branch: settings.targetBranch,
      token: settings.githubPat
    })
    deps.logger.info('publish', 'GitHub Tree API call started', {
      pushFileCount: plan.files.length,
      pushPaths: plan.files.map((f) => f.path)
    })
    const apiStart = Date.now()
    const outcome = await publisher.publish(
      plan,
      `notedrop: publish ${plan.manifest.items.length} item(s) at ${plan.manifest.generatedAt}`
    )
    deps.logger.info('publish', 'GitHub Tree API completed', {
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
        console.warn('onPublishSuccess hook failed', cbErr)
      }
    }

    if (
      !force
      && !pushedViewerAsset
      && settings.publishViewerAssets
      && plan.viewerCacheKey !== null
      && settings.lastViewerCacheKey !== plan.viewerCacheKey
    ) {
      new Notice(VIEWER_SYNC_NOTICE_MESSAGE, VIEWER_SYNC_NOTICE_TIMEOUT_MS)
      deps.logger.info('publish', 'viewer fingerprint mismatch; sync required', {
        currentFingerprint: plan.viewerCacheKey,
        baselineFingerprint: settings.lastViewerCacheKey
      })
    }
    if (plan.warnings.length > 0) {
      console.warn('notedrop: warnings', plan.warnings)
      new Notice(`notedrop: ${plan.warnings.length}건 경고 (콘솔 확인)`, 6000)
    }

    return {
      status: 'published',
      commitSha: outcome.commitSha,
      changedFiles: outcome.changedFiles,
      initialized: outcome.initialized,
      pushedViewerAsset,
      warningCount: plan.warnings.length
    }
  } catch (err) {
    startNotice.hide()
    const message = err instanceof Error ? err.message : String(err)
    const errorData = {
      name: err instanceof Error ? err.name : 'UnknownError',
      message,
      stack: err instanceof Error ? err.stack : undefined,
      status: err instanceof GitHubApiError ? err.status : null
    }
    if (err instanceof GitHubAuthError) {
      new Notice('notedrop: GitHub 인증 실패 - PAT와 권한을 확인하세요', 8000)
      deps.logger.error('publish', 'GitHub authentication failed', errorData)
      return { status: 'failed', reason: 'auth', error: message }
    }
    if (err instanceof GitHubApiError) {
      const hint = hintFor(err.status)
      new Notice(`notedrop: GitHub API 오류 (${err.status})${hint}`, 10000)
      deps.logger.error('publish', `GitHub API error ${err.status}`, errorData)
      return {
        status: 'failed',
        reason: 'api',
        error: message,
        statusCode: err.status
      }
    }

    new Notice(`notedrop: 발행 실패 - ${message}`, 8000)
    deps.logger.error('publish', 'publish failed', errorData)
    return { status: 'failed', reason: 'unknown', error: message }
  }
}

function hintFor(status: number): string {
  switch (status) {
    case 404:
      return ' - 레포/브랜치 이름 확인'
    case 422:
      return ' - 빈 repo, 잘못된 input, rate limit 가능'
    case 409:
      return ' - repo 빈 상태 또는 충돌'
    default:
      return ''
  }
}
