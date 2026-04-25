import esbuild from 'esbuild'
import process from 'node:process'
import builtinModules from 'node:module'

const watch = process.argv.includes('--watch')
const prod = process.env.NODE_ENV === 'production'

const banner = `/*
 * notedrop - Obsidian plugin
 * Built ${new Date().toISOString()}
 */
`

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ['src/main.ts'],
  bundle: true,
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
