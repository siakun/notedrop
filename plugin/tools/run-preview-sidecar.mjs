#!/usr/bin/env node
// preview-sidecar.ts 를 esbuild 로 빌드 후 실행. cross-platform wrapper.
// Usage: node plugin/tools/run-preview-sidecar.mjs [vault-root] [port]
//   기본: <repo-root>/viewer/samples, port 4321

import * as esbuild from 'esbuild'
import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginRoot = path.resolve(here, '..')
const repoRoot = path.resolve(pluginRoot, '..')

const entry = path.join(here, 'preview-sidecar.ts')
const out = path.join(here, 'preview-sidecar.mjs')

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  external: ['obsidian', 'chokidar', 'fsevents'],
  // banner: ESM esbuild bundles need require shim for some node modules
  banner: {
    js: "import { createRequire as _cr } from 'node:module'; const require = _cr(import.meta.url);"
  },
  loader: { '.b64': 'text' },
  logLevel: 'warning',
  absWorkingDir: pluginRoot
})

const argv = process.argv.slice(2)
const vault = argv[0] ?? path.join(repoRoot, 'viewer', 'samples')
// 우선순위: CLI arg > NOTEDROP_SIDECAR_PORT env > 4321 default.
// next.config.mjs rewrites 가 같은 env 를 읽으므로 env 한 곳만 바꾸면
// 양쪽 동기화됨.
const port = argv[1] ?? process.env.NOTEDROP_SIDECAR_PORT ?? '4321'

const child = spawn(process.execPath, [out, vault, port], { stdio: 'inherit' })

const forward = (sig) => {
  if (!child.killed) child.kill(sig)
}
process.on('SIGINT', () => forward('SIGINT'))
process.on('SIGTERM', () => forward('SIGTERM'))

child.on('exit', (code) => process.exit(code ?? 1))
