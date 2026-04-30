#!/usr/bin/env node
// generate-sample.ts 를 esbuild 로 빌드 후 실행. cross-platform wrapper.
// Usage: node plugin/tools/run-sample.mjs <vault-root> <public-root>
//   기본: <repo-root>/viewer/samples → <repo-root>/viewer/public

import * as esbuild from 'esbuild'
import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginRoot = path.resolve(here, '..')
const repoRoot = path.resolve(pluginRoot, '..')

const entry = path.join(here, 'generate-sample.ts')
const out = path.join(here, 'generate-sample.mjs')

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  external: ['obsidian'],
  logLevel: 'warning',
  absWorkingDir: pluginRoot
})

const argv = process.argv.slice(2)
const vault = argv[0] ?? path.join(repoRoot, 'viewer', 'samples')
const publicRoot = argv[1] ?? path.join(repoRoot, 'viewer', 'public')

const r = spawnSync(process.execPath, [out, vault, publicRoot], { stdio: 'inherit' })
process.exit(r.status ?? 1)
