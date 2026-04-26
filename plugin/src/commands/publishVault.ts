import { Notice } from 'obsidian'
import type { App } from 'obsidian'
import type { VaultFs } from '../ports/VaultFs.js'
import type { PublishIndex } from '../domain/PublishIndex.js'
import type { ContentTransformer } from '../domain/ContentTransformer.js'
import type { ManifestBuilder } from '../domain/ManifestBuilder.js'
import type { PluginSettings } from '../settings/PluginSettings.js'
import {
  PublishOrchestrator,
  type PublishedFile
} from '../domain/PublishOrchestrator.js'
import {
  GitHubPublisher,
  GitHubAuthError,
  GitHubApiError
} from '../infrastructure/GitHubPublisher.js'
import { unzipSync } from 'fflate'

import viewerZipB64 from '../embedded/viewer.zip.b64'
import type { CommandDef } from './types.js'

const TEXT_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'md', 'svg', 'xml', 'map'
])

export type PublishDeps = {
  app: App
  vault: VaultFs
  index: PublishIndex
  transformer: ContentTransformer
  manifestBuilder: ManifestBuilder
  onPublishSuccess?: () => Promise<void>
}

export type PublishGate = {
  /**
   * dirty=true (변경 있음) 면 publish 진행. dirty=false 면 Notice 표시
   * 후 게이트가 publish 차단. 게이트 자체가 차단 결정 + 사용자 메시지를
   * 책임진다.
   */
  isDirty: () => Promise<boolean>
}

/**
 * smart publish — dirty 게이트 통과 시에만 실제 publish.
 * 발행 버튼 + Cmd+P "Publish vault to GitHub" 명령어가 같은 진입점.
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
 * commands 가 PluginContext 에서 publish 의존을 추출하는 헬퍼. ctx 의 풀
 * surface 가 아닌 publish 가 필요한 5 개 + onPublishSuccess 콜백만.
 */
export function buildPublishDeps(
  ctx: import('../services/PluginContext.js').PluginContext
): PublishDeps {
  return {
    app: ctx.app,
    vault: ctx.vault,
    index: ctx.index,
    transformer: ctx.transformer,
    manifestBuilder: ctx.manifestBuilder,
    onPublishSuccess: async () => {
      const snapshot = await ctx.dirtyTracker.computeSnapshot()
      await ctx.dirtyTracker.confirmPublished(snapshot)
    }
  }
}

/**
 * 핵심 publish 실행. 게이트 없음. forcePublishVault 와 publishVault 양쪽이
 * 공유. 외부 호출자는 publishVault (smart) 또는 forcePublishVault (force)
 * 만 사용. executePublish 는 같은 commands/ 폴더 안에서만 import 의도.
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
    if (settings.publishViewerAssets) {
      const viewerFiles = collectViewerFiles(settings.publicRoot)
      plan.files.push(...viewerFiles)
    }
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
    const initSuffix = outcome.initialized ? ' (초기 commit)' : ''
    new Notice(
      `notedrop: 발행 완료${initSuffix} (commit ${outcome.commitSha.slice(0, 7)}, ${outcome.changedFiles}개 파일)`,
      8000
    )
    if (deps.onPublishSuccess) {
      try { await deps.onPublishSuccess() } catch (cbErr) {
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

function collectViewerFiles(publicRoot: string): PublishedFile[] {
  const root = publicRoot.trim().replace(/^\/|\/$/g, '')
  const prefix = root === '' ? '' : `${root}/`
  const files: PublishedFile[] = [
    { kind: 'text', path: `${prefix}.nojekyll`, content: '' }
  ]
  const entries = unpackViewerZip(viewerZipB64)
  if (entries.size === 0) {
    console.warn('notedrop publishVault: viewer.zip 비어 있음 — viewer 자산 미포함')
    return files
  }
  const decoder = new TextDecoder('utf-8')
  for (const [path, bytes] of entries) {
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    if (TEXT_EXTENSIONS.has(ext)) {
      files.push({ kind: 'text', path: `${prefix}${path}`, content: decoder.decode(bytes) })
    } else {
      files.push({ kind: 'binary', path: `${prefix}${path}`, content: bytes })
    }
  }
  return files
}

function unpackViewerZip(b64: string): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  if (!b64 || !b64.trim()) return out
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(b64.trim())
  } catch (err) {
    console.warn('notedrop publishVault: viewer.zip base64 decode 실패', err)
    return out
  }
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch (err) {
    console.warn('notedrop publishVault: viewer.zip 압축 해제 실패', err)
    return out
  }
  for (const [path, content] of Object.entries(entries)) {
    out.set(path, content)
  }
  return out
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'))
  }
  const binary = atob(b64)
  const result = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i)
  return result
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
