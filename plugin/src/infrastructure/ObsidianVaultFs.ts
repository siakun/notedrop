import type { App, TFile } from 'obsidian'
import type { VaultFs } from '../ports/VaultFs.js'

export class ObsidianVaultFs implements VaultFs {
  constructor(private app: App) {}

  async readFile(path: string): Promise<string> {
    return this.app.vault.adapter.read(path)
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const buffer = await this.app.vault.adapter.readBinary(path)
    return new Uint8Array(buffer)
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.app.vault.adapter.write(path, content)
  }

  async fileExists(path: string): Promise<boolean> {
    return this.app.vault.adapter.exists(path)
  }

  async listFiles(folderPath: string): Promise<string[]> {
    const exists = await this.app.vault.adapter.exists(folderPath)
    if (!exists) return []
    const listing = await this.app.vault.adapter.list(folderPath)
    return [...listing.files]
  }

  async listAllFiles(): Promise<string[]> {
    return this.app.vault.getFiles().map((f: TFile) => f.path)
  }

  async searchByName(filename: string): Promise<string[]> {
    return this.app.vault
      .getFiles()
      .filter((f: TFile) => f.name === filename)
      .map((f: TFile) => f.path)
  }
}
