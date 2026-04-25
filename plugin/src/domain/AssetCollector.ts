import type { VaultFs } from '../ports/VaultFs.js'
import type { Reference, AssetRef } from './types.js'

export type AssetWriter = (outputPath: string, content: Uint8Array) => Promise<void>

export class AssetCollector {
  constructor(private vault: VaultFs) {}

  async findRefs(refs: Reference[], hash: string): Promise<AssetRef[]> {
    const out: AssetRef[] = []
    const seen = new Set<string>()
    for (const ref of refs) {
      if (ref.type !== 'image') continue
      if (ref.resolution.kind !== 'image') continue
      const basename = ref.resolution.vaultPath.split('/').pop()!
      const outputPath = `/content/${hash}/_assets/${basename}`
      if (seen.has(outputPath)) continue
      seen.add(outputPath)
      const bytes = await this.vault.readBinary(ref.resolution.vaultPath)
      out.push({
        vaultPath: ref.resolution.vaultPath,
        outputPath,
        size: bytes.byteLength,
        mime: ref.resolution.mime
      })
    }
    return out
  }

  async copy(refs: AssetRef[], writer: AssetWriter): Promise<void> {
    for (const ref of refs) {
      const bytes = await this.vault.readBinary(ref.vaultPath)
      await writer(ref.outputPath, bytes)
    }
  }
}
