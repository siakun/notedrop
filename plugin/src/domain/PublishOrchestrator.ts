import type { VaultFs } from '../ports/VaultFs.js'
import type { PublishIndex } from './PublishIndex.js'
import type { ContentTransformer } from './ContentTransformer.js'
import type { ManifestBuilder } from './ManifestBuilder.js'
import type { Manifest, PageFrontmatter } from '../types.js'

export type PublishedFile =
  | { kind: 'text'; path: string; content: string }
  | { kind: 'binary'; path: string; content: Uint8Array }

export type PublishPlan = {
  files: PublishedFile[]
  manifest: Manifest
  warnings: string[]
}

export type OrchestratorOptions = {
  generatedBy?: string
  publicRoot?: string
}

export class PublishOrchestrator {
  private readonly publicRoot: string
  private readonly generatedBy: string

  constructor(
    private vault: VaultFs,
    private index: PublishIndex,
    private transformer: ContentTransformer,
    private manifestBuilder: ManifestBuilder,
    options: OrchestratorOptions = {}
  ) {
    this.publicRoot = (options.publicRoot ?? 'viewer/public').replace(/\/$/, '')
    this.generatedBy = options.generatedBy ?? 'notedrop'
  }

  async plan(): Promise<PublishPlan> {
    const items = this.index.list()
    const warnings: string[] = []
    const files: PublishedFile[] = []
    const seenAssets = new Set<string>()

    for (const item of items) {
      const transformed = await this.transformer.transform(item.filePath)
      warnings.push(...transformed.warnings)

      const fmYaml = serializeFrontmatter(transformed.outputFrontmatter)
      const md = `---\n${fmYaml}---\n\n${transformed.markdown}`
      files.push({
        kind: 'text',
        path: this.rebase(`/content/${item.hash}/index.md`),
        content: md
      })

      for (const ref of transformed.assetRefs) {
        const target = this.rebase(ref.outputPath)
        if (seenAssets.has(target)) continue
        seenAssets.add(target)
        const bytes = await this.vault.readBinary(ref.vaultPath)
        files.push({ kind: 'binary', path: target, content: bytes })
      }
    }

    const manifest = this.manifestBuilder.build({ generatedBy: this.generatedBy })
    files.push({
      kind: 'text',
      path: this.rebase('/manifest.json'),
      content: JSON.stringify(manifest, null, 2)
    })

    return { files, manifest, warnings }
  }

  private rebase(absolutePath: string): string {
    const trimmed = absolutePath.startsWith('/') ? absolutePath.slice(1) : absolutePath
    return `${this.publicRoot}/${trimmed}`
  }
}

function serializeFrontmatter(fm: PageFrontmatter): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(fm)) {
    if (value === null || value === undefined) {
      lines.push(`${key}: null`)
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${escapeYaml(value)}`)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${key}: ${value}`)
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`)
    }
  }
  return lines.join('\n') + '\n'
}

function escapeYaml(value: string): string {
  if (/^[A-Za-z0-9_\-./]+$/.test(value) && !/^(true|false|null)$/i.test(value)) {
    return value
  }
  return JSON.stringify(value)
}
