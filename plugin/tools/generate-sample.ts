import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { PublishIndex } from '../src/domain/PublishIndex.js'
import { ContentResolver } from '../src/domain/ContentResolver.js'
import { ContentTransformer } from '../src/domain/ContentTransformer.js'
import { ManifestBuilder } from '../src/domain/ManifestBuilder.js'
import { BookAssembler } from '../src/domain/BookAssembler.js'
import { PublishOrchestrator } from '../src/domain/PublishOrchestrator.js'
import { NodeVaultFs, NodeMetaCache } from './node-runtime.js'

const ARG_VAULT = process.argv[2]
const ARG_PUBLIC = process.argv[3]

if (!ARG_VAULT || !ARG_PUBLIC) {
  console.error('Usage: generate-sample <vault-root-abs> <public-root-abs>')
  process.exit(1)
}

async function main(): Promise<void> {
  const vault = new NodeVaultFs(ARG_VAULT!)
  const meta = new NodeMetaCache(vault)
  await meta.preload()

  // 1차 PublishIndex.build — frontmatter 'notedrop-publish: true' 인 entry 만 등록
  const index = new PublishIndex(vault, meta)
  await index.build()

  // ADR-0005 spec 의도 보강: entry 의 render='book' 인 경우, BookAssembler 가
  // 추출한 chapter 들에도 publish flag 자동 주입 → "entry 만 토글" 워크플로
  const bookAssembler = new BookAssembler(vault, meta)
  for (const entry of index.list()) {
    if (entry.render !== 'book') continue
    const plan = await bookAssembler.assemble(entry.filePath)
    for (const ch of plan.chapters) {
      meta.override(ch.filePath, { 'notedrop-publish': true })
    }
  }

  // 2차 build: chapter 포함 + linkBooks
  await index.build({ bookAssembler })

  console.log(`PublishIndex: ${index.list().length} items`)
  for (const it of index.list()) {
    const tag = it.type === 'entry' ? `${it.render}-entry` : 'chapter'
    const childCount = it.chapters ? it.chapters.length : null
    console.log(
      `  [${tag}] ${it.title} (${it.filePath})` +
        (childCount !== null ? ` chapters=${childCount}` : '') +
        (it.parent ? ` parent=${it.parent.slice(0, 8)} order=${it.order ?? '-'}` : '')
    )
  }
  if (index.warnings.length > 0) {
    for (const w of index.warnings) console.log(`  ! warning: ${w.code} ${w.message}`)
  }

  // Orchestrator pipeline
  const resolver = new ContentResolver(vault, meta, index)
  const transformer = new ContentTransformer(resolver, index, vault)
  const manifestBuilder = new ManifestBuilder(index)
  const orchestrator = new PublishOrchestrator(
    vault,
    index,
    transformer,
    manifestBuilder,
    { generatedBy: 'notedrop-sample-generator', publicRoot: '' }
  )
  const planResult = await orchestrator.plan()

  console.log(`Plan: ${planResult.files.length} files, ${planResult.warnings.length} warnings`)
  for (const w of planResult.warnings.slice(0, 12)) console.log(`  warn: ${w}`)

  const manifest = planResult.manifest

  // Clean slate: wipe content/ before write
  const contentDir = path.join(ARG_PUBLIC!, 'content')
  try {
    await fs.rm(contentDir, { recursive: true, force: true })
  } catch {
    // fresh
  }

  // Write plan files (skip auto-generated manifest — we write merged one below)
  let textCount = 0
  let binaryCount = 0
  for (const f of planResult.files) {
    if (f.path === 'manifest.json') continue
    const out = path.join(ARG_PUBLIC!, f.path)
    await fs.mkdir(path.dirname(out), { recursive: true })
    if (f.kind === 'text') {
      await fs.writeFile(out, f.content, 'utf8')
      textCount++
    } else if (f.kind === 'binary') {
      await fs.writeFile(out, f.content)
      binaryCount++
    }
  }

  // Write manifest (with welcome merged if requested)
  await fs.writeFile(
    path.join(ARG_PUBLIC!, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  )

  console.log(
    `Wrote: manifest.json + ${textCount} text + ${binaryCount} binary → ${ARG_PUBLIC}`
  )
  console.log(`Manifest items: ${manifest.items.length}`)
  for (const it of manifest.items) {
    console.log(`  - ${it.type}/${it.render} ${it.title} (hash=${it.hash.slice(0, 8)})`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
