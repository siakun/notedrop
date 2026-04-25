import esbuild from 'esbuild'
import process from 'node:process'
import fs from 'node:fs/promises'
import path from 'node:path'
import builtinModules from 'node:module'

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
    '.txt': 'text'
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
  const src = path.resolve('../viewer/dist')
  const dst = path.resolve('src/embedded')
  await fs.mkdir(dst, { recursive: true })

  const sources = [
    { from: 'index.html', to: 'index.html' },
    { from: 'app.js', to: 'app.js.txt' },
    { from: 'style.css', to: 'style.css' }
  ]

  let missing = 0
  for (const file of sources) {
    const fromPath = path.join(src, file.from)
    try {
      await fs.copyFile(fromPath, path.join(dst, file.to))
    } catch {
      missing += 1
      await fs.writeFile(path.join(dst, file.to), '')
    }
  }
  if (missing > 0) {
    console.warn(`[notedrop esbuild] ${missing} viewer asset(s) missing — run "cd ../viewer && npm run build" first`)
  }
}
