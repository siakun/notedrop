import { unzipSync } from 'fflate'
import type { PublishedFile, PublishPlan } from '../domain/PublishOrchestrator.js'
import { PublishOrchestrator } from '../domain/PublishOrchestrator.js'
import type { PluginSettings } from '../settings/PluginSettings.js'
import type { VaultFs } from '../ports/VaultFs.js'
import type { PublishIndex } from '../domain/PublishIndex.js'
import type { ContentTransformer } from '../domain/ContentTransformer.js'
import type { ManifestBuilder } from '../domain/ManifestBuilder.js'
import viewerZipB64 from '../embedded/viewer.zip.b64'
import viewerFingerprintRaw from '../embedded/viewer.fingerprint.txt'

/**
 * 발행 plan 의 단일 출처. orchestrator (manifest + content) + viewer 자산
 * (publishViewerAssets ON 시) 을 합친 결과를 반환.
 *
 * publishVault 가 push 할 때, DirtyTracker 가 변경 감지 snapshot 을 만들
 * 때 모두 같은 함수 사용 → diff 비교가 viewer 자산도 포함하여 정확.
 *
 * v0.1.45: viewer fingerprint cache 도입. settings.lastViewerCacheKey 와
 * `${VIEWER_FINGERPRINT}|${publicRoot}|${repoSegment}` 비교가 동일이면
 * viewer.zip unpack/path-replace 자체 skip + baseline 의 hash 를 cached
 * entry 로 plan.files 에 등록. 변경 감지 filter 가 cached entry 를 push
 * 안 함 (base_tree 보존). 효과: 일반 publish 의 plan 빌드 + DirtyTracker
 * snapshot 에서 viewer 자산의 unpack + 144 file SHA-256 hash 모두 skip.
 */
export type PlanFactoryOptions = { force?: boolean }
export type PlanFactory = (options?: PlanFactoryOptions) => Promise<PublishPlan>

const VIEWER_BASE_PLACEHOLDER = '/__NOTEDROP_BASE__'

export const VIEWER_FINGERPRINT = (viewerFingerprintRaw ?? '').trim()

const TEXT_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'md', 'svg', 'xml', 'map'
])

export type PlanFactoryDeps = {
  vault: VaultFs
  index: PublishIndex
  transformer: ContentTransformer
  manifestBuilder: ManifestBuilder
}

/**
 * 매 호출 시 fresh PublishOrchestrator 생성 — settings (publicRoot,
 * publishViewerAssets, targetRepo) 변경 즉시 반영. 사용자가 SettingsTab
 * 에서 변경한 후 plugin reload 의무 사라짐.
 *
 * 이전 (v0.1.36 까지): main.ts onload 에서 orchestrator 1 회 생성. settings
 * 변경 후 reload 전엔 옛 publicRoot 사용. publish 가 잘못된 path 로 push.
 */
export function createPlanFactory(
  deps: PlanFactoryDeps,
  settings: PluginSettings
): PlanFactory {
  return async (options) => {
    const orchestrator = new PublishOrchestrator(
      deps.vault,
      deps.index,
      deps.transformer,
      deps.manifestBuilder,
      { publicRoot: settings.publicRoot, generatedBy: 'notedrop-plugin' }
    )
    const plan = await orchestrator.plan()
    plan.viewerCacheKey = null
    plan.viewerCacheHit = false
    if (settings.publishViewerAssets) {
      const segment = deriveRepoSegment(settings.targetRepo)
      const cacheKey = buildViewerCacheKey(VIEWER_FINGERPRINT, settings.publicRoot, segment)
      plan.viewerCacheKey = cacheKey
      const force = options?.force === true
      const hasBaseline = settings.lastPublishedFiles !== null
      // v0.1.46 옵션 B: 일반 publish (force=false + baseline 있음) 는
      // *항상* baseline 의 viewer 자산을 cached entry 로 등록 (fingerprint
      // match 무관). viewer 자산의 *push* 는 syncViewerAssets 명령어 책임.
      // viewerCacheHit = fingerprint match 의미 — Notice 분기용 (mismatch 시
      // publishVault 가 "viewer sync 의무" Notice).
      // force publish 또는 첫 publish (baseline 없음) 는 전체 unpack — 의도된
      // 일괄 push.
      if (!force && hasBaseline) {
        plan.viewerCacheHit = VIEWER_FINGERPRINT !== ''
          && settings.lastViewerCacheKey === cacheKey
        const baseline = settings.lastPublishedFiles!
        for (const [path, snap] of Object.entries(baseline)) {
          if (isViewerAssetPath(path, settings.publicRoot)) {
            plan.files.push({ kind: 'cached', path, hash: snap.hash })
          }
        }
      } else {
        plan.files.push(...collectViewerFiles(settings.publicRoot, segment))
      }
    }
    return plan
  }
}

/**
 * cache key 빌드. fingerprint 외 publicRoot 와 repoSegment 도 포함 — 둘 중
 * 하나만 바뀌어도 viewer 자산의 path 또는 content 가 달라지므로 cache 무효.
 */
export function buildViewerCacheKey(
  fingerprint: string,
  publicRoot: string,
  repoSegment: string
): string {
  return `${fingerprint}|${publicRoot}|${repoSegment}`
}

/**
 * baseline 의 path 가 viewer 자산인지 (manifest/content 가 아닌지) 분류.
 * cache hit 시 이 함수가 true 인 path 만 cached entry 로 plan.files 에 존재.
 */
export function isViewerAssetPath(path: string, publicRoot: string): boolean {
  const prefix = publicRoot.trim().replace(/^\/|\/$/g, '')
  if (prefix !== '' && !path.startsWith(`${prefix}/`)) return false
  const stripped = prefix === '' ? path : path.slice(prefix.length + 1)
  if (stripped === 'manifest.json') return false
  if (stripped.startsWith('content/')) return false
  return true
}

/**
 * viewer.zip 안의 *bootstrap 자산* — Next.js 빌드가 viewer/public/* 을 out/*
 * 으로 그대로 복사하면서 함께 들어가는 manifest.json + content/welcome/* 등.
 * publish 가 *실제* manifest + content 를 push 하므로 viewer 자산에서 제외.
 *
 * 미제외 시 GitHub Tree API 의 last-write-wins 동작 → bootstrap manifest 가
 * 사용자 manifest 를 덮어씀 → share repo root manifest 영구히 welcome 만 표시.
 * (v0.1.40 fix 의 근본 원인)
 */
function isBootstrapAsset(path: string): boolean {
  return path === 'manifest.json' || path.startsWith('content/')
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
    if (isBootstrapAsset(path)) continue
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
