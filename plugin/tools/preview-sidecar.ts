// Dev preview sidecar — viewer/samples/ 를 watch 하다가 변경 시 PublishIndex
// 를 full rebuild 하고, before/after diff 를 PublishIndex.dispatch 로 전파.
// PreviewServer 가 그 SSE 를 /events 로 broadcast → viewer dev 의 EventSource
// consumer 가 invalidate 트리거. Next dev rewrites 가 /manifest.json,
// /content/**, /events 를 이 사이드카로 proxy.
//
// 플러그인의 PreviewServer 와 같은 클래스를 그대로 재사용 — viewer.zip 만
// '' 로 비워 viewer asset 서빙은 비활성 (Next dev 가 viewer 페이지 처리).

import * as path from 'node:path'
import chokidar from 'chokidar'

import { PublishIndex, type SeedEntry } from '../src/domain/PublishIndex.js'
import type { PublishedItem } from '../src/domain/types.js'
import { ContentResolver } from '../src/domain/ContentResolver.js'
import { ContentTransformer } from '../src/domain/ContentTransformer.js'
import { ManifestBuilder } from '../src/domain/ManifestBuilder.js'
import { BookAssembler } from '../src/domain/BookAssembler.js'
import { PublishOrchestrator } from '../src/domain/PublishOrchestrator.js'
import { PreviewServer } from '../src/infrastructure/PreviewServer.js'
import { NodeVaultFs, NodeMetaCache } from './node-runtime.js'

const ARG_VAULT = process.argv[2]
const ARG_PORT = process.argv[3]

if (!ARG_VAULT) {
  console.error('Usage: preview-sidecar <vault-root-abs> [port]')
  process.exit(1)
}

// 우선순위: CLI arg > NOTEDROP_SIDECAR_PORT env > 4321. wrapper 가 이미
// 같은 fallback 을 적용하지만 사이드카가 직접 호출되는 경우도 안전하게.
const PORT = Number(
  ARG_PORT ?? process.env.NOTEDROP_SIDECAR_PORT ?? '4321'
)
const DEBOUNCE_MS = 200

async function buildFull(
  index: PublishIndex,
  meta: NodeMetaCache,
  bookAssembler: BookAssembler
): Promise<void> {
  // Reset meta cache — derived overrides (book chapter publish flags) from
  // a previous pass would otherwise persist even after the chapter is
  // removed from the book, leaking orphan items into the manifest.
  meta.clear()
  await meta.preload()

  // Same two-pass logic as generate-sample: build → inject book chapter
  // publish flags → rebuild with linkBooks.
  await index.build()
  for (const entry of index.list()) {
    if (entry.render !== 'book') continue
    const plan = await bookAssembler.assemble(entry.filePath)
    for (const ch of plan.chapters) {
      meta.override(ch.filePath, { 'notedrop-publish': true })
    }
  }
  await index.build({ bookAssembler })
}

/** Volatile fields excluded from structural diff — `updatedAt` always
 * changes on rebuild, `publishedAt` is preserved via seeds so it shouldn't
 * drift, but exclude defensively. */
function stableJson(item: PublishedItem): string {
  const { updatedAt: _u, publishedAt: _p, ...rest } = item
  return JSON.stringify(rest)
}

function snapshot(index: PublishIndex): Map<string, string> {
  const out = new Map<string, string>()
  for (const item of index.list()) {
    out.set(item.hash, stableJson(item))
  }
  return out
}

function pathHashSnapshot(index: PublishIndex): Map<string, string> {
  const out = new Map<string, string>()
  for (const item of index.list()) {
    out.set(item.filePath, item.hash)
  }
  return out
}

/** Per-path snapshot of the seed-relevant fields. Used to preserve hash on
 * detected renames (chokidar emits unlink+add for a rename, which would
 * otherwise produce a fresh UUID and emit added+removed). */
function pathEntrySnapshot(
  index: PublishIndex
): Map<string, { hash: string; publishedAt: string; slug: string | null }> {
  const out = new Map<string, { hash: string; publishedAt: string; slug: string | null }>()
  for (const item of index.list()) {
    out.set(item.filePath, {
      hash: item.hash,
      publishedAt: item.publishedAt,
      slug: item.slug
    })
  }
  return out
}

function reseed(index: PublishIndex): void {
  const entries: SeedEntry[] = index.list().map((it) => ({
    filePath: it.filePath,
    hash: it.hash,
    publishedAt: it.publishedAt,
    slug: it.slug
  }))
  index.seed(entries)
}

function diffAndDispatch(
  index: PublishIndex,
  before: Map<string, string>,
  after: Map<string, string>,
  touchedHashes: Set<string>
): { added: number; changed: number; removed: number } {
  let added = 0
  let changed = 0
  let removed = 0
  const seenChanged = new Set<string>()
  for (const [hash, json] of after) {
    if (!before.has(hash)) {
      index.dispatch('added', hash)
      added++
    } else if (before.get(hash) !== json) {
      index.dispatch('changed', hash)
      seenChanged.add(hash)
      changed++
    }
  }
  for (const hash of before.keys()) {
    if (!after.has(hash)) {
      index.dispatch('removed', hash)
      removed++
    }
  }
  // Touched-file body content edits don't show up in stable diff (PublishedItem
  // only carries metadata). Explicitly emit 'changed' for these so viewer
  // refetches /content/<hash>/index.md.
  for (const hash of touchedHashes) {
    if (seenChanged.has(hash)) continue
    if (!after.has(hash)) continue
    index.dispatch('changed', hash)
    changed++
  }
  return { added, changed, removed }
}

async function main(): Promise<void> {
  const vaultRoot = path.resolve(ARG_VAULT!)
  console.log(`[sidecar] vault root: ${vaultRoot}`)
  console.log(`[sidecar] port: ${PORT}`)

  const vault = new NodeVaultFs(vaultRoot)
  const meta = new NodeMetaCache(vault)
  await meta.preload()

  const index = new PublishIndex(vault, meta)
  const bookAssembler = new BookAssembler(vault, meta)

  await buildFull(index, meta, bookAssembler)
  // Initial seed — without this, every rebuild generates fresh UUIDs and
  // diff sees +N/-N (all old removed, all new added) for any change.
  reseed(index)
  console.log(`[sidecar] initial build: ${index.list().length} items (seeded)`)

  const resolver = new ContentResolver(vault, meta, index)
  const transformer = new ContentTransformer(resolver, index, vault)
  const manifestBuilder = new ManifestBuilder(index)
  const orchestrator = new PublishOrchestrator(
    vault,
    index,
    transformer,
    manifestBuilder,
    { generatedBy: 'notedrop-sample-sidecar', publicRoot: '' }
  )

  const server = new PreviewServer(orchestrator, vault, index, {
    port: PORT,
    host: '127.0.0.1',
    viewerZipB64: '', // viewer asset 서빙 비활성 — Next dev 가 처리
    onPreviewError: (category, msg, data) => {
      console.error(`[sidecar] preview_error ${category}: ${msg}`, data ?? '')
    }
  })

  const status = await server.start()
  if (status.state === 'running') {
    console.log(`[sidecar] preview server: ${status.url}`)
  }

  // chokidar — debounced rebuild on any file change under vault root.
  // ignoreInitial=true: preload + initial build already done above.
  let pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null
  // Serialize flushes — without this, a long rebuild + rapid edits can race
  // on shared index/meta state.
  let flushChain: Promise<void> = Promise.resolve()

  const runFlush = async (): Promise<void> => {
    timer = null
    const paths = [...pending]
    pending.clear()
    if (paths.length === 0) return

    const before = snapshot(index)
    const beforePathHash = pathHashSnapshot(index)
    const beforeEntries = pathEntrySnapshot(index)

    // Refresh meta cache for all .md files in the batch — refreshFile 는
    // .md 가 아니면 noop. 삭제된 파일은 evict.
    for (const p of paths) {
      const exists = await vault.fileExists(p)
      if (exists) await meta.refreshFile(p)
      else meta.evictFile(p)
    }

    // Heuristic rename detection: if exactly one path disappeared and exactly
    // one new published path appeared in this batch, treat as rename and
    // pre-seed the new path with the old hash so the rebuild reuses it.
    // Limitation: simultaneous unrelated add+remove will be misidentified —
    // acceptable for dev, where renames are far more common than coincident
    // independent edits.
    const removedPaths: string[] = []
    const addedPaths: string[] = []
    for (const p of paths) {
      const exists = await vault.fileExists(p)
      const wasIndexed = beforePathHash.has(p)
      if (!exists && wasIndexed) removedPaths.push(p)
      else if (exists && !wasIndexed && p.endsWith('.md')) addedPaths.push(p)
    }
    if (removedPaths.length === 1 && addedPaths.length === 1) {
      const oldEntry = beforeEntries.get(removedPaths[0]!)
      if (oldEntry) {
        index.seed([{
          filePath: addedPaths[0]!,
          hash: oldEntry.hash,
          publishedAt: oldEntry.publishedAt,
          slug: oldEntry.slug
        }])
      }
    }

    try {
      await buildFull(index, meta, bookAssembler)
    } catch (err) {
      console.error('[sidecar] rebuild failed:', err)
      return
    }

    // Re-seed so newly-added files keep their hash on subsequent rebuilds.
    reseed(index)

    // Compute hashes of touched files for body-content 'changed' emit.
    // Only include items that *already existed* (same hash before+after) —
    // newly added items already get an 'added' event from the structural diff,
    // emitting 'changed' too would be a duplicate.
    const touchedHashes = new Set<string>()
    for (const p of paths) {
      const beforeHash = beforePathHash.get(p)
      const afterHash = index.getByPath(p)?.hash
      if (afterHash && beforeHash === afterHash) touchedHashes.add(afterHash)
    }

    const after = snapshot(index)
    const stats = diffAndDispatch(index, before, after, touchedHashes)
    if (stats.added || stats.changed || stats.removed) {
      console.log(
        `[sidecar] rebuild: +${stats.added} ~${stats.changed} -${stats.removed} ` +
          `(touched ${paths.length} file(s))`
      )
    }
  }

  const flush = (): Promise<void> => {
    // Chain so each flush waits for the previous to finish before mutating
    // shared state. Errors don't break the chain.
    flushChain = flushChain.catch(() => undefined).then(() => runFlush())
    return flushChain
  }

  const schedule = (relPath: string): void => {
    pending.add(relPath)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void flush()
    }, DEBOUNCE_MS)
  }

  const watcher = chokidar.watch(vaultRoot, {
    ignoreInitial: true,
    ignored: /(^|[/\\])\.(?!notedrop-publish|notedrop-)/, // skip dotfiles
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 }
  })

  watcher
    .on('add', (abs) => schedule(vault.rel(abs)))
    .on('change', (abs) => schedule(vault.rel(abs)))
    .on('unlink', (abs) => schedule(vault.rel(abs)))
    .on('ready', () => console.log('[sidecar] watcher ready'))
    .on('error', (err) => console.error('[sidecar] watcher error:', err))

  const shutdown = async (): Promise<void> => {
    console.log('[sidecar] shutting down...')
    await watcher.close()
    await server.stop()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

main().catch((err) => {
  console.error('[sidecar] fatal:', err)
  process.exit(1)
})
