import crypto from 'node:crypto'
import type { PublishOrchestrator } from '../domain/PublishOrchestrator.js'
import type {
  PluginSettings,
  PublishedFileSnapshot
} from '../settings/PluginSettings.js'

export type PlanSnapshot = {
  digest: string
  files: Record<string, PublishedFileSnapshot>
}

export type PublishDiff = {
  added: string[]
  modified: string[]
  removed: string[]
  hasBaseline: boolean
  current: Record<string, PublishedFileSnapshot>
  previous: Record<string, PublishedFileSnapshot> | null
}

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
 */
export class DirtyTracker {
  constructor(
    private readonly orchestrator: PublishOrchestrator,
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
    this.settings.unpublishedChanges = false
    await this.saveSettings()
  }

  async computeDigest(): Promise<string> {
    return (await this.computeSnapshot()).digest
  }

  async computeSnapshot(): Promise<PlanSnapshot> {
    const plan = await this.orchestrator.plan()
    const hash = crypto.createHash('sha256')
    const files: Record<string, PublishedFileSnapshot> = {}
    const sorted = [...plan.files].sort((a, b) =>
      a.path.localeCompare(b.path)
    )
    for (const file of sorted) {
      const fileSha = crypto.createHash('sha256')
      if (file.kind === 'text') {
        fileSha.update(stripVolatile(file.path, file.content))
      } else {
        fileSha.update(Buffer.from(file.content))
      }
      const hex = fileSha.digest('hex')
      files[file.path] = {
        hash: hex,
        text: file.kind === 'text' ? file.content : null
      }
      hash.update(file.path)
      hash.update('\0')
      hash.update(hex)
      hash.update('\x01')
    }
    return { digest: hash.digest('hex'), files }
  }

  async computeDiff(): Promise<PublishDiff> {
    const { files: current } = await this.computeSnapshot()
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
