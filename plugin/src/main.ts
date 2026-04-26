import { Plugin } from 'obsidian'
import { ObsidianVaultFs } from './infrastructure/ObsidianVaultFs.js'
import { ObsidianMetaCache } from './infrastructure/ObsidianMetaCache.js'
import { VaultEventBridge } from './infrastructure/VaultEventBridge.js'
import { PreviewServer } from './infrastructure/PreviewServer.js'
import { PublishIndex, type SeedEntry } from './domain/PublishIndex.js'
import { BookAssembler } from './domain/BookAssembler.js'
import { ContentResolver } from './domain/ContentResolver.js'
import { ContentTransformer } from './domain/ContentTransformer.js'
import { ManifestBuilder } from './domain/ManifestBuilder.js'
import { PublishOrchestrator } from './domain/PublishOrchestrator.js'
import {
  DEFAULT_SETTINGS,
  type PluginSettings
} from './settings/PluginSettings.js'
import { NotedropSettingTab } from './settings/SettingsTab.js'
import { shareNote } from './commands/shareNote.js'
import { unshareNote } from './commands/unshareNote.js'
import { openSharedList } from './commands/openSharedList.js'
import { copyShareUrl } from './commands/copyShareUrl.js'
import { publishVault } from './commands/publishVault.js'
import {
  startPreviewServer,
  stopPreviewServer,
  openPreviewInBrowser
} from './commands/previewServer.js'
import type { PublishedItem } from './domain/types.js'

const SEED_SAVE_DEBOUNCE_MS = 500
const HASH_HEX_RE = /^[0-9a-f]{32}$/

export default class NotedropPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS
  private vault!: ObsidianVaultFs
  private meta!: ObsidianMetaCache
  private index!: PublishIndex
  private bridge!: VaultEventBridge
  private resolver!: ContentResolver
  private transformer!: ContentTransformer
  private manifestBuilder!: ManifestBuilder
  private orchestrator!: PublishOrchestrator
  private preview!: PreviewServer
  private seedSaveTimer: ReturnType<typeof setTimeout> | null = null

  override async onload(): Promise<void> {
    await this.loadSettings()

    this.vault = new ObsidianVaultFs(this.app)
    this.meta = new ObsidianMetaCache(this.app)
    this.index = new PublishIndex(this.vault, this.meta)
    this.resolver = new ContentResolver(this.vault, this.meta, this.index)
    this.transformer = new ContentTransformer(this.resolver, this.index, this.vault)
    this.manifestBuilder = new ManifestBuilder(this.index)
    this.orchestrator = new PublishOrchestrator(
      this.vault,
      this.index,
      this.transformer,
      this.manifestBuilder,
      { publicRoot: this.settings.publicRoot, generatedBy: 'notedrop-plugin' }
    )
    const bookAssembler = new BookAssembler(this.vault, this.meta)
    this.bridge = new VaultEventBridge(this.meta, this.index)
    this.preview = new PreviewServer(this.orchestrator, this.vault, this.index, {
      port: this.settings.previewPort
    })

    this.index.seed(this.normalizeSeeds(this.settings.publishedSeeds))
    this.index.on('added', () => this.markDirtyAndSchedule())
    this.index.on('changed', () => this.markDirtyAndSchedule())
    this.index.on('removed', () => this.markDirtyAndSchedule())

    this.addSettingTab(new NotedropSettingTab(this.app, this))

    this.addCommand({
      id: 'share-note',
      name: 'Share this note',
      callback: () => { void shareNote(this.app, this.index) }
    })
    this.addCommand({
      id: 'unshare-note',
      name: 'Unshare this note',
      callback: () => { void unshareNote(this.app, this.index) }
    })
    this.addCommand({
      id: 'open-shared-list',
      name: 'Open shared list',
      callback: () => { openSharedList(this.app, this.index) }
    })
    this.addCommand({
      id: 'copy-share-url',
      name: 'Copy share URL',
      callback: () => { void copyShareUrl(this.app, this.index, this.settings) }
    })
    this.addCommand({
      id: 'publish-vault',
      name: 'Publish vault to GitHub',
      callback: () => { void this.runPublish() }
    })
    this.addCommand({
      id: 'start-preview',
      name: 'Start preview server',
      callback: () => { void startPreviewServer(this.app, this.preview) }
    })
    this.addCommand({
      id: 'stop-preview',
      name: 'Stop preview server',
      callback: () => { void stopPreviewServer(this.app, this.preview) }
    })
    this.addCommand({
      id: 'open-preview',
      name: 'Open preview in browser',
      callback: () => { void openPreviewInBrowser(this.app, this.preview) }
    })

    this.app.workspace.onLayoutReady(async () => {
      await this.index.build({ bookAssembler })
      this.bridge.start()
      console.log(
        `notedrop: indexed ${this.index.list().length} published note(s)`
      )
      void this.persistSeedsNow()
      if (this.settings.autoStartPreview) {
        try {
          const status = await this.preview.start()
          if (status.state === 'running') {
            console.log(`notedrop preview: ${status.url}`)
          }
        } catch (err) {
          console.warn('notedrop preview auto start 실패:', err)
        }
      }
    })

    console.log('notedrop loaded')
  }

  override async onunload(): Promise<void> {
    if (this.seedSaveTimer) {
      clearTimeout(this.seedSaveTimer)
      this.seedSaveTimer = null
      await this.persistSeedsNow()
    }
    this.bridge?.stop()
    await this.preview?.stop()
    console.log('notedrop unloaded')
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<PluginSettings> | null
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
    if (!Array.isArray(this.settings.publishedSeeds)) {
      this.settings.publishedSeeds = []
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  indexList(): PublishedItem[] {
    return this.index?.list() ?? []
  }

  previewStatus(): ReturnType<PreviewServer['getStatus']> {
    return this.preview?.getStatus() ?? { state: 'stopped' }
  }

  async togglePreview(start: boolean): Promise<void> {
    if (start) await this.preview.start()
    else await this.preview.stop()
  }

  hasUnpublishedChanges(): boolean {
    return this.settings.unpublishedChanges
  }

  async runPublish(): Promise<void> {
    await publishVault(
      {
        app: this.app,
        vault: this.vault,
        index: this.index,
        transformer: this.transformer,
        manifestBuilder: this.manifestBuilder,
        onPublishSuccess: async () => {
          this.settings.unpublishedChanges = false
          await this.saveSettings()
        }
      },
      this.settings
    )
  }

  private markDirtyAndSchedule(): void {
    if (!this.settings.unpublishedChanges) {
      this.settings.unpublishedChanges = true
    }
    this.scheduleSeedSave()
  }

  private normalizeSeeds(seeds: SeedEntry[]): SeedEntry[] {
    return seeds.map((s) => ({
      ...s,
      hash: dashifyHash(s.hash)
    }))
  }

  private snapshotSeeds(): SeedEntry[] {
    return this.index.list().map((it) => ({
      filePath: it.filePath,
      hash: it.hash,
      slug: it.slug,
      publishedAt: it.publishedAt
    }))
  }

  private scheduleSeedSave(): void {
    if (this.seedSaveTimer) clearTimeout(this.seedSaveTimer)
    this.seedSaveTimer = setTimeout(() => {
      this.seedSaveTimer = null
      void this.persistSeedsNow()
    }, SEED_SAVE_DEBOUNCE_MS)
  }

  private async persistSeedsNow(): Promise<void> {
    const fresh = this.snapshotSeeds()
    if (seedsEqual(this.settings.publishedSeeds, fresh)) return
    this.settings.publishedSeeds = fresh
    await this.saveSettings()
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
