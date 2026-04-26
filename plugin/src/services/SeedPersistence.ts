import type { PublishIndex, SeedEntry } from '../domain/PublishIndex.js'
import type { PluginSettings } from '../settings/PluginSettings.js'

const SEED_SAVE_DEBOUNCE_MS = 500
const HASH_HEX_RE = /^[0-9a-f]{32}$/

/**
 * 발행 hash·slug 영속화 (§13.4.2).
 *
 * - PublishIndex 의 added/changed/removed/rename 이벤트 → 500ms 디바운스
 *   → settings.publishedSeeds snapshot 저장
 * - 옵시디언 재시작 시 settings.publishedSeeds 를 PublishIndex.seed() 에
 *   주입하여 같은 hash 유지 (외부 발행 URL 안 깨짐)
 * - 옛 32-hex (대시 없는) seed 는 dashifyHash() 로 자동 마이그레이션
 *
 * 시작/중지 라이프사이클은 호출자 책임 (start: index 이벤트 구독,
 * stop: 디바운스 timer 해제 + 마지막 snapshot persist).
 */
export class SeedPersistence {
  private timer: ReturnType<typeof setTimeout> | null = null
  private indexUnsubs: Array<() => void> = []

  constructor(
    private readonly index: PublishIndex,
    private readonly settings: PluginSettings,
    private readonly saveSettings: () => Promise<void>,
    private readonly onMutation?: () => void
  ) {}

  start(): void {
    const handler = (): void => {
      if (this.onMutation) this.onMutation()
      this.schedule()
    }
    this.indexUnsubs.push(this.index.on('added', handler))
    this.indexUnsubs.push(this.index.on('changed', handler))
    this.indexUnsubs.push(this.index.on('removed', handler))
  }

  async stop(): Promise<void> {
    for (const unsub of this.indexUnsubs) unsub()
    this.indexUnsubs = []
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      await this.persistNow()
    }
  }

  /** 옵시디언 onLayoutReady 직후 호출 — 첫 build 결과 영속화. */
  async hydrateAfterBuild(): Promise<void> {
    await this.persistNow()
  }

  /** 외부에서 명시적으로 즉시 저장 (테스트 또는 종료 직전 등). */
  async persistNow(): Promise<void> {
    const fresh = this.snapshot()
    if (seedsEqual(this.settings.publishedSeeds, fresh)) return
    this.settings.publishedSeeds = fresh
    await this.saveSettings()
  }

  /** 옵시디언 재시작 후 인덱스에 seed 주입 시 사용. */
  loadNormalizedSeeds(): SeedEntry[] {
    return this.settings.publishedSeeds.map((s) => ({
      ...s,
      hash: dashifyHash(s.hash)
    }))
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.persistNow()
    }, SEED_SAVE_DEBOUNCE_MS)
  }

  private snapshot(): SeedEntry[] {
    return this.index.list().map((it) => ({
      filePath: it.filePath,
      hash: it.hash,
      slug: it.slug,
      publishedAt: it.publishedAt
    }))
  }
}

function dashifyHash(hash: string): string {
  if (HASH_HEX_RE.test(hash)) {
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`
  }
  return hash
}

function seedsEqual(a: SeedEntry[], b: SeedEntry[]): boolean {
  if (a.length !== b.length) return false
  const ai = new Map(a.map((e) => [e.filePath, e]))
  for (const e of b) {
    const prev = ai.get(e.filePath)
    if (!prev) return false
    if (prev.hash !== e.hash) return false
    if (prev.slug !== e.slug) return false
    if (prev.publishedAt !== e.publishedAt) return false
  }
  return true
}
