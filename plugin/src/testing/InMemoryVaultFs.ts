import type { VaultFs } from '../ports/VaultFs.js'

export class InMemoryVaultFs implements VaultFs {
  private files: Map<string, string>

  constructor(initial: Record<string, string> = {}) {
    this.files = new Map(Object.entries(initial))
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`InMemoryVaultFs: ${path} not found`)
    return content
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const content = await this.readFile(path)
    return new TextEncoder().encode(content)
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async listFiles(folderPath: string): Promise<string[]> {
    const prefix = folderPath.endsWith('/') ? folderPath : folderPath + '/'
    const out: string[] = []
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      if (rest.includes('/')) continue
      out.push(path)
    }
    return out
  }

  async listAllFiles(): Promise<string[]> {
    return [...this.files.keys()]
  }

  async searchByName(filename: string): Promise<string[]> {
    const out: string[] = []
    for (const path of this.files.keys()) {
      const base = path.split('/').pop()
      if (base === filename) out.push(path)
    }
    return out
  }
}
