import { Plugin } from 'obsidian'
import { ObsidianVaultFs } from './infrastructure/ObsidianVaultFs.js'
import { ObsidianMetaCache } from './infrastructure/ObsidianMetaCache.js'
import { VaultEventBridge } from './infrastructure/VaultEventBridge.js'
import { PublishIndex } from './domain/PublishIndex.js'
import { BookAssembler } from './domain/BookAssembler.js'
import {
  DEFAULT_SETTINGS,
  type PluginSettings
} from './settings/PluginSettings.js'
import { NotedropSettingTab } from './settings/SettingsTab.js'
import { shareNote } from './commands/shareNote.js'
import { unshareNote } from './commands/unshareNote.js'
import { openSharedList } from './commands/openSharedList.js'
import { copyShareUrl } from './commands/copyShareUrl.js'
import type { PublishedItem } from './domain/types.js'

export default class NotedropPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS
  private vault!: ObsidianVaultFs
  private meta!: ObsidianMetaCache
  private index!: PublishIndex
  private bridge!: VaultEventBridge

  override async onload(): Promise<void> {
    await this.loadSettings()

    this.vault = new ObsidianVaultFs(this.app)
    this.meta = new ObsidianMetaCache(this.app)
    this.index = new PublishIndex(this.vault, this.meta)
    const bookAssembler = new BookAssembler(this.vault, this.meta)
    this.bridge = new VaultEventBridge(this.meta, this.index)

    this.addSettingTab(new NotedropSettingTab(this.app, this))

    this.addCommand({
      id: 'share-note',
      name: 'Share this note',
      callback: () => {
        void shareNote(this.app, this.index)
      }
    })
    this.addCommand({
      id: 'unshare-note',
      name: 'Unshare this note',
      callback: () => {
        void unshareNote(this.app, this.index)
      }
    })
    this.addCommand({
      id: 'open-shared-list',
      name: 'Open shared list',
      callback: () => {
        openSharedList(this.app, this.index)
      }
    })
    this.addCommand({
      id: 'copy-share-url',
      name: 'Copy share URL',
      callback: () => {
        void copyShareUrl(this.app, this.index, this.settings)
      }
    })

    this.app.workspace.onLayoutReady(async () => {
      await this.index.build({ bookAssembler })
      this.bridge.start()
      console.log(
        `notedrop: indexed ${this.index.list().length} published note(s)`
      )
    })

    console.log('notedrop loaded')
  }

  override onunload(): void {
    this.bridge?.stop()
    console.log('notedrop unloaded')
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<PluginSettings> | null
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  indexList(): PublishedItem[] {
    return this.index?.list() ?? []
  }
}
