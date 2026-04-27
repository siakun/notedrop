import { Notice } from 'obsidian'
import crypto from 'node:crypto'
import type { App } from 'obsidian'
import type {
  PluginSettings,
  PublishedFileSnapshot
} from '../settings/PluginSettings.js'
import {
  GitHubPublisher,
  GitHubAuthError,
  GitHubApiError
} from '../infrastructure/GitHubPublisher.js'
import {
  buildViewerCacheKey,
  collectViewerFiles,
  deriveRepoSegment,
  isViewerAssetPath,
  VIEWER_FINGERPRINT
} from '../services/PlanFactory.js'
import type { Logger } from '../services/Logger.js'
import type { CommandDef } from './types.js'

/**
 * v0.1.46 옵션 B 신규 명령어 — viewer 자산만 push.
 *
 * 사용 시나리오:
 * - plugin update 후 사용자가 share repo 의 viewer 자산 갱신
 * - VIEWER_FINGERPRINT 가 settings.lastViewerCacheKey 와 다를 때 사용자
 *   trigger
 *
 * 동작:
 * 1. fingerprint 비교 — 일치면 Notice "변경 없음" + early return
 * 2. 다르면 collectViewerFiles 전체 unpack → ~144 file 일괄 push
 * 3. baseline 의 viewer 자산 path 만 갱신 (manifest + content 보존)
 * 4. lastViewerCacheKey 갱신 → 다음 publish 의 cache hit 활성화
 *
 * 일반 publish (publishVault) 는 옵션 B 후 viewer 자산 push X (baseline
 * 의 cached entry 만 등록 + 변경 감지 filter 가 변경 없음 분류). 즉 viewer
 * 자산 갱신은 *항상 본 명령어 명시 trigger* 의무. 사용자가 plugin update 후
 * 한 번도 실행하지 않으면 share repo 의 viewer UI 가 옛 chunk hash 그대로
 * (즉 fetch 가 *옛 path* 사용 — UI 깨지지 않음, 단 새 plugin 의 변경
 * 사항 미반영).
 */
export type SyncViewerDeps = {
  app: App
  logger: Logger
  saveSettings: () => Promise<void>
}

export async function syncViewerAssets(
  deps: SyncViewerDeps,
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
  if (!settings.publishViewerAssets) {
    new Notice('notedrop: publishViewerAssets 옵션 OFF — viewer 자산 sync 안 함', 5000)
    return
  }
  if (VIEWER_FINGERPRINT === '') {
    new Notice('notedrop: viewer fingerprint 비어 있음 — plugin 빌드 의무', 5000)
    return
  }

  const segment = deriveRepoSegment(settings.targetRepo)
  const cacheKey = buildViewerCacheKey(VIEWER_FINGERPRINT, settings.publicRoot, segment)

  // fingerprint 일치 = viewer 자산 변경 없음 → push 의무 X
  if (settings.lastViewerCacheKey === cacheKey) {
    deps.logger.info('sync', 'viewer 자산 변경 없음 — sync skip', {
      cacheKey,
      lastPublishedFilesCount: settings.lastPublishedFiles
        ? Object.keys(settings.lastPublishedFiles).length
        : 0
    })
    new Notice(
      'notedrop: viewer 자산 변경 없음 — sync 안 함 (plugin update 안 한 상태)',
      5000
    )
    return
  }

  deps.logger.info('sync', 'viewer 자산 sync 시작', {
    cacheKeyFrom: settings.lastViewerCacheKey,
    cacheKeyTo: cacheKey,
    targetRepo: settings.targetRepo,
    publicRoot: settings.publicRoot
  })

  const startNotice = new Notice('notedrop: viewer 자산 sync 준비 중…', 0)
  try {
    const planStart = Date.now()
    const files = collectViewerFiles(settings.publicRoot, segment)
    const planDurationMs = Date.now() - planStart

    deps.logger.info('sync', 'viewer 자산 plan 빌드', {
      planDurationMs,
      pushFileCount: files.length
    })

    if (files.length === 0) {
      startNotice.hide()
      new Notice('notedrop: viewer 자산 0 — sync skip', 5000)
      return
    }

    startNotice.setMessage(
      `notedrop: viewer 자산 ${files.length} file push 중 (보통 1분 이상 소요)…`
    )

    const publisher = new GitHubPublisher({
      repo: settings.targetRepo,
      branch: settings.targetBranch,
      token: settings.githubPat
    })
    deps.logger.info('sync', 'GitHub Tree API 호출 시작', {
      pushFileCount: files.length
    })
    const apiStart = Date.now()
    const outcome = await publisher.publish(
      {
        files,
        manifest: {
          version: 1,
          generatedAt: new Date().toISOString(),
          generatedBy: 'notedrop-plugin-sync',
          items: []
        },
        warnings: []
      },
      `notedrop: sync viewer assets at ${new Date().toISOString()}`
    )
    deps.logger.info('sync', 'GitHub Tree API 완료', {
      commitSha: outcome.commitSha,
      changedFiles: outcome.changedFiles,
      url: outcome.url,
      durationMs: Date.now() - apiStart
    })

    // baseline 갱신 — manifest + content 보존, viewer 자산 path 만 갱신
    const newBaseline: Record<string, PublishedFileSnapshot> = {}
    if (settings.lastPublishedFiles) {
      for (const [path, snap] of Object.entries(settings.lastPublishedFiles)) {
        if (!isViewerAssetPath(path, settings.publicRoot)) {
          newBaseline[path] = snap
        }
      }
    }
    for (const file of files) {
      const fileSha = crypto.createHash('sha256')
      if (file.kind === 'text') {
        fileSha.update(file.content)
        newBaseline[file.path] = {
          hash: fileSha.digest('hex'),
          text: file.content
        }
      } else if (file.kind === 'binary') {
        fileSha.update(Buffer.from(file.content))
        newBaseline[file.path] = {
          hash: fileSha.digest('hex'),
          text: null
        }
      }
    }
    settings.lastPublishedFiles = newBaseline
    settings.lastViewerCacheKey = cacheKey
    await deps.saveSettings()
    deps.logger.info('sync', 'baseline 갱신 완료', {
      newBaselineCount: Object.keys(newBaseline).length,
      newViewerCacheKey: cacheKey
    })

    startNotice.hide()
    new Notice(
      `notedrop: viewer sync 완료 (commit ${outcome.commitSha.slice(0, 7)}, ${outcome.changedFiles}개 파일)`,
      8000
    )
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
      deps.logger.error('sync', 'GitHub 인증 실패', errorData)
    } else if (err instanceof GitHubApiError) {
      new Notice(`notedrop: GitHub API 오류 (${err.status})`, 10000)
      deps.logger.error('sync', `GitHub API 오류 ${err.status}`, errorData)
    } else {
      new Notice(`notedrop: viewer sync 실패 — ${(err as Error).message}`, 8000)
      deps.logger.error('sync', 'viewer sync 실패', errorData)
    }
  }
}

export const syncViewerAssetsCommand: CommandDef = {
  id: 'sync-viewer-assets',
  name: 'Sync viewer assets to GitHub (plugin update 후 viewer 자산 갱신)',
  callback: (ctx) =>
    syncViewerAssets(
      {
        app: ctx.app,
        logger: ctx.logger,
        saveSettings: ctx.saveSettings
      },
      ctx.settings
    )
}
