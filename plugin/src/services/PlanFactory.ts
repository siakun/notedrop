import { unzipSync } from 'fflate'
import type { PublishOrchestrator, PublishedFile, PublishPlan } from '../domain/PublishOrchestrator.js'
import type { PluginSettings } from '../settings/PluginSettings.js'
import viewerZipB64 from '../embedded/viewer.zip.b64'

/**
 * 발행 plan 의 단일 출처. orchestrator (manifest + content) + viewer 자산
 * (publishViewerAssets ON 시) 을 합친 결과를 반환.
 *
 * publishVault 가 push 할 때, DirtyTracker 가 변경 감지 snapshot 을 만들
 * 때 모두 같은 함수 사용 → diff 비교가 viewer 자산도 포함하여 정확.
 */
export type PlanFactory = () => Promise<PublishPlan>

const VIEWER_BASE_PLACEHOLDER = '/__NOTEDROP_BASE__'

const TEXT_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'md', 'svg', 'xml', 'map'
])

export function createPlanFactory(
  orchestrator: PublishOrchestrator,
  settings: PluginSettings
): PlanFactory {
  return async () => {
    const plan = await orchestrator.plan()
    if (settings.publishViewerAssets) {
      const segment = deriveRepoSegment(settings.targetRepo)
      plan.files.push(...collectViewerFiles(settings.publicRoot, segment))
    }
    return plan
  }
}

export function collectViewerFiles(
  publicRoot: string,
  repoSegment: string
): PublishedFile[] {
  const root = publicRoot.trim().replace(/^\/|\/$/g, '')
  const prefix = root === '' ? '' : `${root}/`
  const files: PublishedFile[] = [
    { kind: 'text', path: `${prefix}.nojekyll`, content: '' }
  ]
  const entries = unpackViewerZip(viewerZipB64)
  if (entries.size === 0) {
    console.warn('notedrop PlanFactory: viewer.zip 비어 있음 — viewer 자산 미포함')
    return files
  }
  const decoder = new TextDecoder('utf-8')
  // viewer 빌드는 prod 시 basePath = '/__NOTEDROP_BASE__' placeholder 작성.
  // 여기서 사용자 share repo 이름 (예: notedrop-share) 으로 string replace
  // 하여 GH Pages 호스팅 prefix 와 일치시킴.
  // user/org page (siakun.github.io 같은 root) 면 segment 빈값 → placeholder
  // 자체를 제거.
  const replacement = repoSegment ? `/${repoSegment}` : ''
  for (const [path, bytes] of entries) {
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    if (TEXT_EXTENSIONS.has(ext)) {
      const original = decoder.decode(bytes)
      const rewritten = original.split(VIEWER_BASE_PLACEHOLDER).join(replacement)
      files.push({ kind: 'text', path: `${prefix}${path}`, content: rewritten })
    } else {
      files.push({ kind: 'binary', path: `${prefix}${path}`, content: bytes })
    }
  }
  return files
}

/**
 * settings.targetRepo (예: "siakun/notedrop-share") 에서 GH Pages 호스팅
 * prefix 를 도출. user/org page (siakun/siakun.github.io) 면 빈 문자열.
 */
export function deriveRepoSegment(targetRepo: string): string {
  const parts = targetRepo.trim().split('/')
  if (parts.length !== 2) return ''
  const owner = parts[0]?.trim().toLowerCase() ?? ''
  const repo = parts[1]?.trim() ?? ''
  if (!owner || !repo) return ''
  if (repo.toLowerCase() === `${owner}.github.io`) return ''
  return repo
}

function unpackViewerZip(b64: string): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  if (!b64 || !b64.trim()) return out
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(b64.trim())
  } catch (err) {
    console.warn('notedrop PlanFactory: viewer.zip base64 decode 실패', err)
    return out
  }
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch (err) {
    console.warn('notedrop PlanFactory: viewer.zip 압축 해제 실패', err)
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
