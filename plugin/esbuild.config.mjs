import esbuild from 'esbuild'
import process from 'node:process'
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
    return
  }

  const files = await collectFiles(viewerOut, viewerOut)
  if (files.size === 0) {
    console.warn('[notedrop esbuild] viewer/out/ 가 비어 있음 — 빈 zip 으로 빌드')
    await fs.writeFile(path.join(dst, 'viewer.zip.b64'), '')
    return
  }

  const entries = {}
  for (const [relPath, bytes] of files) {
    entries[relPath] = bytes
  }
  const zipped = zipSync(entries, { level: 6 })
  const b64 = Buffer.from(zipped).toString('base64')
  await fs.writeFile(path.join(dst, 'viewer.zip.b64'), b64)
  console.log(
    `[notedrop esbuild] viewer 자산 ${files.size} 개 → zip ${zipped.byteLength} B → base64 ${b64.length} B`
  )
}

async function collectFiles(root, current, acc = new Map()) {
  const entries = await fs.readdir(current, { withFileTypes: true })
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
