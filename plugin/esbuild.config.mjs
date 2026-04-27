import esbuild from 'esbuild'
import process from 'node:process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import builtinModules from 'node:module'
import { zipSync } from 'fflate'

const watch = process.argv.includes('--watch')
const prod = process.env.NODE_ENV === 'production'

await embedViewerAssets()

const banner = `/*
 * notedrop - Obsidian plugin
 * Built ${new Date().toISOString()}
 */
`

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ['src/main.ts'],
  bundle: true,
  loader: {
    '.html': 'text',
    '.css': 'text',
    '.txt': 'text',
    '.b64': 'text'
  },
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtinModules.builtinModules,
    ...builtinModules.builtinModules.map((m) => `node:${m}`)
  ],
  format: 'cjs',
  target: 'es2022',
  platform: 'browser',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  minify: prod,
  outfile: '../main.js'
})

if (watch) {
  await context.watch()
} else {
  await context.rebuild()
  await context.dispose()
}

async function embedViewerAssets() {
  const viewerOut = path.resolve('../viewer/out')
  const dst = path.resolve('src/embedded')
  await fs.mkdir(dst, { recursive: true })

  let exists = false
  try {
    const stat = await fs.stat(viewerOut)
    exists = stat.isDirectory()
  } catch {
    exists = false
  }

  if (!exists) {
    console.warn(
      '[notedrop esbuild] viewer/out/ 누락 — "cd ../viewer && npm run build" 먼저 실행해야 viewer 자산이 plugin 에 임베드됩니다. 빈 자산으로 빌드 진행.'
    )
    await fs.writeFile(path.join(dst, 'viewer.zip.b64'), '')
    await fs.writeFile(path.join(dst, 'viewer.fingerprint.txt'), '')
    return
  }

  const files = await collectFiles(viewerOut, viewerOut)
  if (files.size === 0) {
    console.warn('[notedrop esbuild] viewer/out/ 가 비어 있음 — 빈 zip 으로 빌드')
    await fs.writeFile(path.join(dst, 'viewer.zip.b64'), '')
    await fs.writeFile(path.join(dst, 'viewer.fingerprint.txt'), '')
    return
  }

  // v0.1.49 deterministic fix: 명시적 sort + zipSync 의 mtime 고정.
  // collectFiles 가 fs.readdir 로 OS 별 다른 순서 (Linux=inode,
  // Windows=alphabetical) 등록 → zipSync 가 입력 순서 그대로 → 다른
  // bytes. 또 fflate 의 zipSync 가 default 로 *현재 mtime* 사용 — 매 빌드
  // 마다 다른 timestamp 존재. 두 문제 모두 fix 완료 실제 cross-platform
  // deterministic.
  // fflate 의 mtime 은 DOS time (1980 base) 사용 — 0 은 invalid.
  // 1980-01-01T00:00:00Z 가 epoch 의 첫 valid 값.
  const FIXED_MTIME = new Date('1980-01-01T00:00:00Z')
  const sortedPaths = [...files.keys()].sort()
  const entries = {}
  for (const relPath of sortedPaths) {
    entries[relPath] = [files.get(relPath), { mtime: FIXED_MTIME }]
  }
  const zipped = zipSync(entries, { level: 6 })
  const b64 = Buffer.from(zipped).toString('base64')
  // Fingerprint = sha256(zipped bytes). 같은 viewer 자산 set + 같은 zip
  // deterministic 출력이면 동일. plugin 이 publish 시 settings 캡처된
  // lastViewerCacheKey 와 비교해 unpack/hash 자체 skip 결정.
  const fingerprint = crypto.createHash('sha256').update(zipped).digest('hex')
  await fs.writeFile(path.join(dst, 'viewer.zip.b64'), b64)
  await fs.writeFile(path.join(dst, 'viewer.fingerprint.txt'), fingerprint)
  console.log(
    `[notedrop esbuild] viewer 자산 ${files.size} 개 → zip ${zipped.byteLength} B → base64 ${b64.length} B (fingerprint ${fingerprint.slice(0, 12)}...)`
  )
}

async function collectFiles(root, current, acc = new Map()) {
  const rawEntries = await fs.readdir(current, { withFileTypes: true })
  // v0.1.49: alphabetic sort — fs.readdir 가 OS 별 순서 보장 안 함
  const entries = rawEntries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    const full = path.join(current, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(root, full, acc)
    } else if (entry.isFile()) {
      const rel = path.relative(root, full).split(path.sep).join('/')
      const bytes = await fs.readFile(full)
      acc.set(rel, new Uint8Array(bytes))
    }
  }
  return acc
}
