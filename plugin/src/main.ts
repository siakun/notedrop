import { Plugin } from 'obsidian'
import { ObsidianVaultFs } from './infrastructure/ObsidianVaultFs.js'
import { ObsidianMetaCache } from './infrastructure/ObsidianMetaCache.js'
import { VaultEventBridge } from './infrastructure/VaultEventBridge.js'
import { PreviewServer } from './infrastructure/PreviewServer.js'
import { PublishIndex } from './domain/PublishIndex.js'
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
import { COMMAND_REGISTRY } from './commands/registry.js'
import { DirtyTracker } from './services/DirtyTracker.js'
import { SeedPersistence } from './services/SeedPersistence.js'
import { createPlanFactory } from './services/PlanFactory.js'
import { FileLogger } from './services/Logger.js'
import type { PluginContext } from './services/PluginContext.js'

const PLUGIN_VERSION = '0.1.40'

/**
 * Plugin entry. Hexagonal 정신상 main.ts 는:
 *  - Plugin 라이프사이클 (onload/onunload/loadSettings/saveSettings)
 *  - Adapters wire-up (Domain + Infra 인스턴스 생성)
 *  - DI Context 빌드 → commands registry iterate → addCommand
 *  - Service 시작/중지 (DirtyTracker, SeedPersistence)
 *  - SettingsTab 등록
 *
 * 가 책임의 전부. 비즈니스 로직 (dirty 계산, seed 영속화, publish 실행) 은
 * services/ + commands/ 안에 캡슐화. main.ts 의 메서드는 ctx 빌드 헬퍼만.
 */
export default class NotedropPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS
  private ctx!: PluginContext
  private seedPersistence!: SeedPersistence

  override async onload(): Promise<void> {
    await this.loadSettings()

    const vault = new ObsidianVaultFs(this.app)
    const meta = new ObsidianMetaCache(this.app)
    const index = new PublishIndex(vault, meta)
    const resolver = new ContentResolver(vault, meta, index)
    const transformer = new ContentTransformer(resolver, index, vault)
    const manifestBuilder = new ManifestBuilder(index)
    const orchestrator = new PublishOrchestrator(
      vault,
      index,
      transformer,
      manifestBuilder,
      { publicRoot: this.settings.publicRoot, generatedBy: 'notedrop-plugin' }
    )
    const bookAssembler = new BookAssembler(vault, meta)
    const bridge = new VaultEventBridge(meta, index)
    const preview = new PreviewServer(orchestrator, vault, index, {
      port: this.settings.previewPort
    })

    const saveSettings = (): Promise<void> => this.saveSettings()
    const logger = new FileLogger({
      app: this.app,
      pluginId: 'notedrop',
      pluginVersion: PLUGIN_VERSION,
      isDebugMode: () => this.settings.debugMode
    })
    const buildPlan = createPlanFactory(
      { vault, index, transformer, manifestBuilder },
      this.settings
    )
    const dirtyTracker = new DirtyTracker(buildPlan, this.settings, saveSettings)
    this.seedPersistence = new SeedPersistence(
      index,
      this.settings,
      saveSettings,
      () => dirtyTracker.markDirty()
    )

    this.ctx = {
      app: this.app,
      vault,
      meta,
      index,
      resolver,
      transformer,
      manifestBuilder,
      orchestrator,
      bridge,
      preview,
      settings: this.settings,
      saveSettings,
      buildPlan,
      dirtyTracker,
      seedPersistence: this.seedPersistence,
      logger
    }

    logger.info('lifecycle', 'plugin onload', {
      version: PLUGIN_VERSION,
      debugMode: this.settings.debugMode,
      targetRepo: this.settings.targetRepo,
      publicRoot: this.settings.publicRoot,
      publishViewerAssets: this.settings.publishViewerAssets,
      previewPort: this.settings.previewPort,
      autoStartPreview: this.settings.autoStartPreview,
      publishedSeedsCount: this.settings.publishedSeeds.length,
      hasBaseline: this.settings.lastPublishedDigest !== null,
      lastPublishedFilesCount: this.settings.lastPublishedFiles
        ? Object.keys(this.settings.lastPublishedFiles).length : 0
    })

    index.seed(this.seedPersistence.loadNormalizedSeeds())
    this.seedPersistence.start()

    this.addSettingTab(new NotedropSettingTab(this.app, this, this.ctx))

    for (const cmd of COMMAND_REGISTRY) {
      this.addCommand({
        id: cmd.id,
        name: cmd.name,
        callback: () => {
          void cmd.callback(this.ctx)
        }
      })
    }

    this.app.workspace.onLayoutReady(async () => {
      await index.build({ bookAssembler })
      bridge.start()
      console.log(
        `notedrop: indexed ${index.list().length} published note(s)`
      )
      await this.seedPersistence.hydrateAfterBuild()
      if (this.settings.autoStartPreview) {
        try {
          const status = await preview.start()
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
    if (this.seedPersistence) await this.seedPersistence.stop()
    this.ctx?.bridge?.stop()
    await this.ctx?.preview?.stop()
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
}
