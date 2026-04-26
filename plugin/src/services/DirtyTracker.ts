import crypto from 'node:crypto'
import type {
  PluginSettings,
  PublishedFileSnapshot
} from '../settings/PluginSettings.js'
import type { PlanFactory } from './PlanFactory.js'

export type PlanSnapshot = {
  digest: string
  files: Record<string, PublishedFileSnapshot>
  /** PlanFactory 가 빌드한 cache key — confirmPublished 시 settings 존재. */
  viewerCacheKey: string | null
}

export type PublishDiff = {
  added: string[]
  modified: string[]
  removed: string[]
  hasBaseline: boolean
  current: Record<string, PublishedFileSnapshot>
  previous: Record<string, PublishedFileSnapshot> | null
}

export type ComputeOptions = { force?: boolean }

/**
 * 발행 dirty 추적 + 컨텐츠 digest 계산.
 *
 * 두 단계 추적 (§13.4.3):
 *  1. vault 저장 시: markDirty() 즉시 boolean (가벼움, 200ms Bridge 디바운스 후 1회)
 *  2. 설정 패널 진입 시: revalidate() 비동기 호출 → 실 digest 비교 →
 *     같으면 dirty=false 로 lazy 정정 (불필요한 publish 방지)
 *
 * 외부 의존: PublishOrchestrator (plan 가져오기) + saveSettings 콜백.
 * Notice/UI 호출 0 — 순수 비즈니스 로직.
 *
 * v0.1.45: PlanFactory 의 viewer fingerprint cache 와 협조. plan.files 의
 * cached kind entry 는 hash 재계산 skip 하고 baseline 의 hash 를 그대로 사용
 * → 일반 publish 의 snapshot 가 viewer 자산 144 file 의 sha256 계산을 skip.
 * force 옵션은 PlanFactory 에 그대로 전파 — 강제 publish 시 cache miss
 * 전체 unpack/hash.
 */
export class DirtyTracker {
  constructor(
    /** 발행 plan 의 단일 출처 — viewer 자산 포함된 전체 파일 목록 */
    private readonly buildPlan: PlanFactory,
    private readonly settings: PluginSettings,
    private readonly saveSettings: () => Promise<void>
  ) {}

  isDirty(): boolean {
    return this.settings.unpublishedChanges
  }

  markDirty(): void {
    if (!this.settings.unpublishedChanges) {
      this.settings.unpublishedChanges = true
    }
  }

  async revalidate(): Promise<boolean> {
    if (!this.settings.lastPublishedDigest) {
      return this.settings.unpublishedChanges
    }
    if (!this.settings.unpublishedChanges) return false
    const fresh = await this.computeDigest()
    if (fresh === this.settings.lastPublishedDigest) {
      this.settings.unpublishedChanges = false
      await this.saveSettings()
      return false
    }
    return true
  }

  async confirmPublished(snapshot: PlanSnapshot): Promise<void> {
    this.settings.lastPublishedDigest = snapshot.digest
    this.settings.lastPublishedFiles = snapshot.files
    this.settings.lastViewerCacheKey = snapshot.viewerCacheKey
    this.settings.unpublishedChanges = false
    await this.saveSettings()
  }

  async computeDigest(options?: ComputeOptions): Promise<string> {
    return (await this.computeSnapshot(options)).digest
  }

  async computeSnapshot(options?: ComputeOptions): Promise<PlanSnapshot> {
    const plan = await this.buildPlan({ force: options?.force })
    const hash = crypto.createHash('sha256')
    const files: Record<string, PublishedFileSnapshot> = {}
    const sorted = [...plan.files].sort((a, b) =>
      a.path.localeCompare(b.path)
    )
    for (const file of sorted) {
      let hex: string
      let text: string | null
      if (file.kind === 'cached') {
        // baseline 에서 가져온 hash 그대로 사용 (재계산 skip — 옵션 A 의
        // 핵심 절감 지점). text 는 lastPublishedFiles 에서 lookup —
        // PlanFactory 가 이 path 를 cached entry 로 발행 시 baseline 이
        // 항상 존재. text 가 binary 인 경우는 null 그대로 (snapshot 포맷
        // 호환).
        hex = file.hash
        text = this.settings.lastPublishedFiles?.[file.path]?.text ?? null
      } else if (file.kind === 'text') {
        const fileSha = crypto.createHash('sha256')
        fileSha.update(stripVolatile(file.path, file.content))
        hex = fileSha.digest('hex')
        text = file.content
      } else {
        const fileSha = crypto.createHash('sha256')
        fileSha.update(Buffer.from(file.content))
        hex = fileSha.digest('hex')
        text = null
      }
      files[file.path] = { hash: hex, text }
      hash.update(file.path)
      hash.update('\0')
      hash.update(hex)
      hash.update('\x01')
    }
    return {
      digest: hash.digest('hex'),
      files,
      viewerCacheKey: plan.viewerCacheKey ?? null
    }
  }

  async computeDiff(options?: ComputeOptions): Promise<PublishDiff> {
    const { files: current } = await this.computeSnapshot(options)
    const prev = this.settings.lastPublishedFiles
    if (!prev) {
      return {
        added: Object.keys(current).sort(),
        modified: [],
        removed: [],
        hasBaseline: false,
        current,
        previous: null
      }
    }
    const added: string[] = []
    const modified: string[] = []
    const removed: string[] = []
    for (const [path, snap] of Object.entries(current)) {
      const before = prev[path]
      if (!before) added.push(path)
      else if (before.hash !== snap.hash) modified.push(path)
    }
    for (const path of Object.keys(prev)) {
      if (!(path in current)) removed.push(path)
    }
    return {
      added: added.sort(),
      modified: modified.sort(),
      removed: removed.sort(),
      hasBaseline: true,
      current,
      previous: prev
    }
  }
}

function stripVolatile(path: string, content: string): string {
  if (path.endsWith('manifest.json')) {
    return content.replace(/"(generatedAt|updatedAt)":\s*"[^"]*"/g, '"$1":""')
  }
  if (path.endsWith('index.md')) {
    return content.replace(/^updatedAt:.*$/m, 'updatedAt:')
  }
  return content
}
