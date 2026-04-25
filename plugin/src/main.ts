import { Plugin } from 'obsidian'
import { ObsidianVaultFs } from './infrastructure/ObsidianVaultFs.js'
import { ObsidianMetaCache } from './infrastructure/ObsidianMetaCache.js'
import { VaultEventBridge } from './infrastructure/VaultEventBridge.js'
import { PublishIndex } from './domain/PublishIndex.js'
import { BookAssembler } from './domain/BookAssembler.js'

export default class NotedropPlugin extends Plugin {
  private vault!: ObsidianVaultFs
  private meta!: ObsidianMetaCache
  private index!: PublishIndex
  private bridge!: VaultEventBridge

  override async onload(): Promise<void> {
    this.vault = new ObsidianVaultFs(this.app)
    this.meta = new ObsidianMetaCache(this.app)
    this.index = new PublishIndex(this.vault, this.meta)
    const bookAssembler = new BookAssembler(this.vault, this.meta)
    this.bridge = new VaultEventBridge(this.meta, this.index)

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
}
