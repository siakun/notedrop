import esbuild from 'esbuild'
import process from 'node:process'
import fs from 'node:fs/promises'
import path from 'node:path'

const watch = process.argv.includes('--watch')
const serve = process.argv.includes('--serve')

const outdir = 'dist'

async function copyStatic() {
  await fs.mkdir(outdir, { recursive: true })
  await fs.copyFile('src/index.html', path.join(outdir, 'index.html'))
  await fs.copyFile('src/style.css', path.join(outdir, 'style.css'))
  try {
    const stat = await fs.stat('public')
    if (stat.isDirectory()) {
      await copyDir('public', outdir)
    }
  } catch {}
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fs.copyFile(s, d)
  }
}

await copyStatic()

const context = await esbuild.context({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  outfile: path.join(outdir, 'app.js'),
  sourcemap: true,
  minify: !watch,
  logLevel: 'info'
})

if (watch) {
  await context.watch()
  if (serve) {
    const { host, port } = await context.serve({
      servedir: outdir,
      host: '127.0.0.1',
      port: 4321
    })
    console.log(`viewer dev server: http://${host}:${port}`)
  }
} else {
  await context.rebuild()
  await context.dispose()
}
