import { Notice } from 'obsidian'
import type { App } from 'obsidian'
import type { VaultFs } from '../ports/VaultFs.js'
import type { PublishIndex } from '../domain/PublishIndex.js'
import type { ContentTransformer } from '../domain/ContentTransformer.js'
import type { ManifestBuilder } from '../domain/ManifestBuilder.js'
import type { PluginSettings } from '../settings/PluginSettings.js'
import { PublishOrchestrator } from '../domain/PublishOrchestrator.js'
import {
  GitHubPublisher,
  GitHubAuthError,
  GitHubApiError
} from '../infrastructure/GitHubPublisher.js'

export type PublishDeps = {
  app: App
  vault: VaultFs
  index: PublishIndex
  transformer: ContentTransformer
  manifestBuilder: ManifestBuilder
}

export async function publishVault(
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

  const orchestrator = new PublishOrchestrator(
    deps.vault,
    deps.index,
    deps.transformer,
    deps.manifestBuilder,
    { publicRoot: settings.publicRoot, generatedBy: 'notedrop-plugin' }
  )

  const startNotice = new Notice('notedrop: 발행 준비 중…', 0)
  try {
    const plan = await orchestrator.plan()
    startNotice.setMessage(
      `notedrop: ${plan.files.length} 파일 GitHub 에 push 중…`
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
    new Notice(
      `notedrop: 발행 완료 (commit ${outcome.commitSha.slice(0, 7)}, ${outcome.changedFiles}개 파일)`,
      8000
    )
    if (plan.warnings.length > 0) {
      console.warn('notedrop: warnings', plan.warnings)
      new Notice(`notedrop: ${plan.warnings.length}건 경고 (콘솔 확인)`, 6000)
    }
  } catch (err) {
    startNotice.hide()
    if (err instanceof GitHubAuthError) {
      new Notice('notedrop: GitHub 인증 실패 — PAT 와 권한을 확인하세요', 8000)
    } else if (err instanceof GitHubApiError) {
      new Notice(`notedrop: GitHub API 오류 (${err.status})`, 8000)
    } else {
      new Notice(`notedrop: 발행 실패 — ${(err as Error).message}`, 8000)
    }
    console.error('notedrop publish failed', err)
  }
}
