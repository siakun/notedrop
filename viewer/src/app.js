import { Marked } from 'marked'
import DOMPurify from 'dompurify'

const app = document.getElementById('app')
const crumbs = document.getElementById('crumbs')

const state = {
  manifest: null,
  byHash: new Map(),
  customCssEl: null
}

const marked = new Marked({
  gfm: true,
  breaks: false,
  pedantic: false
})

marked.use({
  extensions: [
    {
      name: 'highlight',
      level: 'inline',
      start(src) { return src.indexOf('==') },
      tokenizer(src) {
        const m = /^==(?!\s)([\s\S]+?)(?<!\s)==/.exec(src)
        if (m) return { type: 'highlight', raw: m[0], text: m[1] }
      },
      renderer(token) { return `<mark>${marked.parseInline(token.text)}</mark>` }
    }
  ]
})

const calloutRe = /^\[!([a-zA-Z]+)\]([+-]?)\s*(.*)$/
const origBlockquote = (function findBlockquote() {
  let r
  marked.use({
    renderer: {
      blockquote(quote) {
        const text = typeof quote === 'string' ? quote : ''
        const inner = text.replace(/<\/?p>/g, '').trim()
        const m = calloutRe.exec(inner)
        if (m) {
          const kind = m[1].toLowerCase()
          const title = m[3] || m[1]
          return `<div class="callout callout-${kind}"><div class="callout-title">${title}</div></div>`
        }
        return r ? r(quote) : `<blockquote>${quote}</blockquote>`
      }
    }
  })
  return null
})()
void origBlockquote

window.addEventListener('hashchange', render)
init().catch((err) => showError(err))

async function init() {
  await loadManifest()
  await render()
}

async function loadManifest() {
  try {
    const res = await fetch('manifest.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`manifest.json ${res.status}`)
    state.manifest = await res.json()
    state.byHash = new Map((state.manifest.items ?? []).map((it) => [it.hash, it]))
  } catch (err) {
    state.manifest = null
    throw new Error(`매니페스트 로드 실패: ${err.message}`)
  }
}

async function render() {
  resetCustomCss()
  const route = parseRoute()
  if (route.kind === 'home') return renderHome()
  if (route.kind === 'entry') return renderEntry(route.hash, route.chapter)
  showError(new Error('알 수 없는 경로'))
}

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '').trim()
  if (!h) return { kind: 'home' }
  const parts = h.split('/').filter(Boolean)
  return { kind: 'entry', hash: parts[0], chapter: parts[1] ?? null }
}

function renderHome() {
  setCrumbs([])
  if (!state.manifest) return showError(new Error('매니페스트 없음'))
  const entries = state.manifest.items.filter((i) => i.type === 'entry')
  if (entries.length === 0) {
    app.innerHTML = '<div class="empty">아직 발행된 노트가 없습니다.</div>'
    return
  }
  const cards = entries
    .map((it) => `
      <li class="entry-card">
        <a href="#/${it.hash}/">
          <div class="badge">${it.render}</div>
          <h2>${escape(it.title)}</h2>
          <p>${new Date(it.updatedAt).toLocaleDateString()}</p>
        </a>
      </li>`)
    .join('')
  app.className = 'app-shell'
  app.innerHTML = `<ul class="entry-list">${cards}</ul>`
}

async function renderEntry(hash, chapterHash) {
  const item = state.byHash.get(hash)
  if (!item) return showError(new Error(`엔트리 없음: ${hash}`))

  setCrumbs([{ label: item.title, href: `#/${hash}/` }])

  if (item.render === 'doc') {
    return renderDoc(item)
  }
  return renderBook(item, chapterHash)
}

async function renderDoc(item) {
  app.className = 'app-shell'
  const html = await fetchAndRender(item)
  app.innerHTML = renderShell(item, html)
  applyCustomCss(item)
}

async function renderBook(book, chapterHash) {
  const chapters = (book.chapters ?? [])
    .map((h) => state.byHash.get(h))
    .filter(Boolean)
  let active = null
  if (chapterHash) active = chapters.find((c) => c.hash === chapterHash)
  if (!active) active = chapters[0] ?? book

  app.className = 'app-shell book'
  const tocItems = chapters
    .map((c, i) => `<li><a href="#/${book.hash}/${c.hash}" class="${c.hash === active.hash ? 'active' : ''}">${i + 1}. ${escape(c.title)}</a></li>`)
    .join('')
  const toc = `<aside class="toc"><h3>${escape(book.title)}</h3><ol>${tocItems}</ol></aside>`

  const renderTarget = active === book ? book : active
  const html = await fetchAndRender(renderTarget)

  const idx = chapters.findIndex((c) => c.hash === active.hash)
  const prev = idx > 0 ? chapters[idx - 1] : null
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null
  const nav = chapters.length > 1 ? `
    <nav class="chapter-nav">
      <a class="${prev ? '' : 'disabled'}" href="${prev ? `#/${book.hash}/${prev.hash}` : '#'}">← ${prev ? escape(prev.title) : ''}</a>
      <a class="${next ? '' : 'disabled'}" href="${next ? `#/${book.hash}/${next.hash}` : '#'}">${next ? escape(next.title) : ''} →</a>
    </nav>` : ''

  app.innerHTML = `
    ${toc}
    <article>
      ${renderShell(active === book ? book : null, html, { showCover: active === book || idx === 0 })}
      ${nav}
    </article>
  `
  applyCustomCss(book)
}

async function fetchAndRender(item) {
  try {
    const res = await fetch(`content/${item.hash}/index.md`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.text()
    const { frontmatter, body } = splitFrontmatter(raw)
    const html = await marked.parse(body)
    const sanitized = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
    const fixed = fixAssetPaths(sanitized, item.hash)
    return fixed
  } catch (err) {
    return `<div class="error">렌더 실패: ${escape(err.message)}</div>`
  }
}

function renderShell(item, html, opts = {}) {
  const cover = item && item.cover && opts.showCover !== false
    ? `<img class="cover" src="${absoluteAssetUrl(item.cover)}" alt="cover" />`
    : ''
  return `
    ${cover}
    ${item ? `<h1 class="entry-title">${escape(item.title)}</h1>` : ''}
    <div class="entry-content">${html}</div>
  `
}

function fixAssetPaths(html, hash) {
  return html
    .replace(/(src|href)="\/content\//g, `$1="content/`)
}

function absoluteAssetUrl(p) {
  return p.startsWith('/') ? p.slice(1) : p
}

function applyCustomCss(item) {
  if (!item.customCss) return
  const el = document.createElement('style')
  el.dataset.notedrop = 'custom-css'
  el.textContent = `.entry-content { ${item.customCss} }`
  document.head.appendChild(el)
  state.customCssEl = el
}

function resetCustomCss() {
  if (state.customCssEl) {
    state.customCssEl.remove()
    state.customCssEl = null
  }
}

function setCrumbs(items) {
  if (items.length === 0) {
    crumbs.innerHTML = ''
    return
  }
  crumbs.innerHTML = items
    .map((it) => `<a href="${it.href}">${escape(it.label)}</a>`)
    .join(' / ')
}

function showError(err) {
  app.className = 'app-shell'
  app.innerHTML = `<div class="error">${escape(err.message)}</div>`
}

function splitFrontmatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw)
  if (!m) return { frontmatter: {}, body: raw }
  return { frontmatter: parseSimpleYaml(m[1]), body: m[2] }
}

function parseSimpleYaml(text) {
  const out = {}
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim())
    if (!m) continue
    let v = m[2].trim()
    if (v === 'null' || v === '') out[m[1]] = null
    else if (v === 'true') out[m[1]] = true
    else if (v === 'false') out[m[1]] = false
    else if (/^-?\d+(\.\d+)?$/.test(v)) out[m[1]] = Number(v)
    else if (v.startsWith('"') && v.endsWith('"')) {
      try { out[m[1]] = JSON.parse(v) } catch { out[m[1]] = v }
    } else out[m[1]] = v
  }
  return out
}

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
