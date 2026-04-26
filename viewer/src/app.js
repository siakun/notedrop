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

async function init() {
  await loadManifest()
  await render()
  if (isPreviewHost()) connectLiveReload()
}

/* ─── View Settings (theme/font/size/spacing/align) ─────────────────── */

const VS_KEY = 'notedrop:viewSettings'
const VS_DEFAULTS = {
  theme: 'night',
  layout: 'default',
  pageSize: 'A4',
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 25,
  marginRight: 25,
  font: 'system',
  fontScale: 1,
  lineScale: 1,
  align: 'left'
}

const PAGE_DIMS = {
  B4: { w: 257, h: 364 },
  A4: { w: 210, h: 297 },
  B5: { w: 182, h: 257 },
  A5: { w: 148, h: 210 }
}

const MARGIN_MIN = 0
const MARGIN_MAX = 60

const FONT_STACKS = {
  system: 'inherit',
  arial: '"Arial", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  georgia: '"Georgia", "Apple SD Gothic Neo", "Malgun Gothic", serif',
  times: '"Times New Roman", "Apple SD Gothic Neo", "Malgun Gothic", serif',
  trebuchet: '"Trebuchet MS", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  verdana: '"Verdana", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  'serif-kr': '"Noto Serif KR", "Apple SD Gothic Neo", "Malgun Gothic", serif',
  'sans-kr': '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
}

const FONT_STEP = 0.1
const FONT_MIN = 0.7
const FONT_MAX = 1.6
const LINE_STEP = 0.1
const LINE_MIN = 0.8
const LINE_MAX = 1.6

function loadViewSettings() {
  try {
    const raw = localStorage.getItem(VS_KEY)
    if (!raw) return { ...VS_DEFAULTS }
    const parsed = JSON.parse(raw)
    return { ...VS_DEFAULTS, ...parsed }
  } catch { return { ...VS_DEFAULTS } }
}

function saveViewSettings(s) {
  try { localStorage.setItem(VS_KEY, JSON.stringify(s)) } catch {}
}

function applyViewSettings(s) {
  document.documentElement.dataset.theme = s.theme
  document.body.dataset.layout = s.layout
  const root = document.documentElement.style
  root.setProperty('--user-font-stack', FONT_STACKS[s.font] ?? 'inherit')
  root.setProperty('--user-font-scale', String(s.fontScale))
  root.setProperty('--user-line-scale', String(s.lineScale))
  root.setProperty('--user-text-align', s.align)
  const dims = PAGE_DIMS[s.pageSize] ?? PAGE_DIMS.A4
  root.setProperty('--page-width', `${dims.w}mm`)
  root.setProperty('--page-height', `${dims.h}mm`)
  root.setProperty('--page-margin-top', `${s.marginTop}mm`)
  root.setProperty('--page-margin-bottom', `${s.marginBottom}mm`)
  root.setProperty('--page-margin-left', `${s.marginLeft}mm`)
  root.setProperty('--page-margin-right', `${s.marginRight}mm`)
}

function setupViewSettings() {
  const settings = loadViewSettings()
  applyViewSettings(settings)

  const btn = document.getElementById('view-settings-toggle')
  const panel = document.getElementById('view-settings-panel')
  if (!btn || !panel) return

  const open = () => {
    panel.hidden = false
    btn.setAttribute('aria-expanded', 'true')
    document.addEventListener('mousedown', onOutside)
  }
  const close = () => {
    panel.hidden = true
    btn.setAttribute('aria-expanded', 'false')
    document.removeEventListener('mousedown', onOutside)
  }
  const onOutside = (e) => {
    if (panel.contains(e.target) || btn.contains(e.target)) return
    close()
  }
  btn.addEventListener('click', () => {
    if (panel.hidden) open(); else close()
  })

  for (const themeBtn of panel.querySelectorAll('[data-theme-value]')) {
    themeBtn.addEventListener('click', () => {
      settings.theme = themeBtn.dataset.themeValue
      apply()
    })
  }

  for (const layoutBtn of panel.querySelectorAll('[data-layout-value]')) {
    layoutBtn.addEventListener('click', () => {
      settings.layout = layoutBtn.dataset.layoutValue
      apply()
    })
  }

  for (const sizeBtn of panel.querySelectorAll('[data-page-size-value]')) {
    sizeBtn.addEventListener('click', () => {
      settings.pageSize = sizeBtn.dataset.pageSizeValue
      apply()
    })
  }

  const marginInputs = {
    top: panel.querySelector('#vs-margin-top'),
    bottom: panel.querySelector('#vs-margin-bottom'),
    left: panel.querySelector('#vs-margin-left'),
    right: panel.querySelector('#vs-margin-right')
  }
  const marginKeys = { top: 'marginTop', bottom: 'marginBottom', left: 'marginLeft', right: 'marginRight' }
  for (const [side, input] of Object.entries(marginInputs)) {
    input.addEventListener('input', () => {
      const n = clamp(Number.parseInt(input.value, 10), MARGIN_MIN, MARGIN_MAX)
      if (Number.isFinite(n)) {
        settings[marginKeys[side]] = n
        apply()
      }
    })
  }

  const fontSelect = panel.querySelector('#vs-font')
  fontSelect.addEventListener('change', () => {
    settings.font = fontSelect.value
    apply()
  })

  for (const stepBtn of panel.querySelectorAll('[data-action]')) {
    stepBtn.addEventListener('click', () => {
      const action = stepBtn.dataset.action
      if (action === 'font-down') settings.fontScale = clamp(round1(settings.fontScale - FONT_STEP), FONT_MIN, FONT_MAX)
      else if (action === 'font-up') settings.fontScale = clamp(round1(settings.fontScale + FONT_STEP), FONT_MIN, FONT_MAX)
      else if (action === 'line-down') settings.lineScale = clamp(round1(settings.lineScale - LINE_STEP), LINE_MIN, LINE_MAX)
      else if (action === 'line-up') settings.lineScale = clamp(round1(settings.lineScale + LINE_STEP), LINE_MIN, LINE_MAX)
      apply()
    })
  }

  for (const alignBtn of panel.querySelectorAll('[data-align-value]')) {
    alignBtn.addEventListener('click', () => {
      settings.align = alignBtn.dataset.alignValue
      apply()
    })
  }

  function apply() {
    saveViewSettings(settings)
    applyViewSettings(settings)
    refreshUi()
    requestAnimationFrame(() => {
      applyLayoutPagination()
      updatePageIndicator()
    })
  }

  function refreshUi() {
    for (const themeBtn of panel.querySelectorAll('[data-theme-value]')) {
      themeBtn.setAttribute('aria-checked', String(themeBtn.dataset.themeValue === settings.theme))
    }
    for (const layoutBtn of panel.querySelectorAll('[data-layout-value]')) {
      layoutBtn.setAttribute('aria-checked', String(layoutBtn.dataset.layoutValue === settings.layout))
    }
    for (const sizeBtn of panel.querySelectorAll('[data-page-size-value]')) {
      sizeBtn.setAttribute('aria-checked', String(sizeBtn.dataset.pageSizeValue === settings.pageSize))
    }
    marginInputs.top.value = String(settings.marginTop)
    marginInputs.bottom.value = String(settings.marginBottom)
    marginInputs.left.value = String(settings.marginLeft)
    marginInputs.right.value = String(settings.marginRight)
    fontSelect.value = settings.font
    panel.querySelector('#vs-font-pct').textContent = `${Math.round(settings.fontScale * 100)}%`
    panel.querySelector('#vs-line-pct').textContent = `${Math.round(settings.lineScale * 100)}%`
    for (const alignBtn of panel.querySelectorAll('[data-align-value]')) {
      alignBtn.setAttribute('aria-checked', String(alignBtn.dataset.alignValue === settings.align))
    }
  }

  refreshUi()
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }
function round1(n) { return Math.round(n * 10) / 10 }
function mmToPx(mm) { return mm * (96 / 25.4) }

/* ─── Layout pagination (paper-page divs for all non-default layouts) ── */

let stripController = null

function applyLayoutPagination() {
  const content = document.querySelector('.entry-content')
  if (!content) return
  const layout = document.body.dataset.layout
  unpaginate(content)
  if (stripController) { stripController.destroy(); stripController = null }
  const settings = loadViewSettings()
  if (layout === 'vertical') {
    paginateVertical(content, settings)
  } else if (layout === 'horizontal' || layout === 'two-pages') {
    paginateStrip(content, settings, layout)
  }
}

function unpaginate(content) {
  // Unwrap from page-strip first
  const strip = content.querySelector(':scope > .page-strip')
  if (strip) {
    const flat = []
    for (const page of Array.from(strip.children)) {
      flat.push(...Array.from(page.children))
    }
    content.innerHTML = ''
    for (const c of flat) {
      // reset any inline width/height set by strip pagination
      c.style.removeProperty('width')
      c.style.removeProperty('height')
      content.appendChild(c)
    }
    return
  }
  // Unwrap from direct paper-page sections
  const sections = content.querySelectorAll(':scope > .paper-page')
  if (sections.length === 0) return
  for (const sec of sections) {
    while (sec.firstChild) {
      content.insertBefore(sec.firstChild, sec)
    }
    sec.remove()
  }
}

function paginateVertical(content, settings) {
  const dims = PAGE_DIMS[settings.pageSize] ?? PAGE_DIMS.A4
  const innerHeightPx = mmToPx(dims.h - settings.marginTop - settings.marginBottom)
  if (innerHeightPx <= 0) return

  const flat = Array.from(content.children)
  if (flat.length === 0) return

  // Wrap all children in one initial paper-page so heights measure at correct width
  const initialPage = createPaperPage()
  for (const child of flat) initialPage.appendChild(child)
  content.innerHTML = ''
  content.appendChild(initialPage)

  // Force layout and snapshot heights
  const heights = flat.map((c) => c.offsetHeight)

  // Decide page groups
  const groups = splitByHeight(heights, innerHeightPx)

  // Create real pages
  content.innerHTML = ''
  for (const group of groups) {
    const page = createPaperPage()
    for (const idx of group) page.appendChild(flat[idx])
    content.appendChild(page)
  }
}

function paginateStrip(content, settings, layout) {
  const flat = Array.from(content.children)
  if (flat.length === 0) return

  const fit = computePageFit(settings, layout)
  if (!fit) return

  // Measure children's heights at fitted page-inner width
  const measure = createPaperPage()
  applyFitDims(measure, fit)
  for (const child of flat) measure.appendChild(child)
  content.innerHTML = ''
  content.appendChild(measure)
  const heights = flat.map((c) => c.offsetHeight)
  const groups = splitByHeight(heights, fit.innerHeight)

  // Build strip
  content.innerHTML = ''
  const strip = document.createElement('div')
  strip.className = 'page-strip'
  for (const group of groups) {
    const page = createPaperPage()
    applyFitDims(page, fit)
    for (const idx of group) page.appendChild(flat[idx])
    strip.appendChild(page)
  }
  content.appendChild(strip)

  stripController = new StripController(strip, layout, groups.length)
}

function applyFitDims(pageEl, fit) {
  pageEl.style.width = `${fit.width}px`
  pageEl.style.height = `${fit.height}px`
  pageEl.style.padding = `${fit.padTop}px ${fit.padRight}px ${fit.padBottom}px ${fit.padLeft}px`
}

function computePageFit(settings, layout) {
  const dims = PAGE_DIMS[settings.pageSize] ?? PAGE_DIMS.A4
  const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 56
  const viewportH = window.innerHeight - headerH - 32
  const viewportW = window.innerWidth - 32
  if (viewportH <= 0 || viewportW <= 0) return null

  const ratio = dims.w / dims.h
  const gap = 16
  const horizPaddingExtra = 32  // breathing room around the page

  let pageHeight = viewportH - 32
  let pageWidth = pageHeight * ratio

  if (layout === 'two-pages') {
    const widthBudget = (viewportW - gap - horizPaddingExtra * 2) / 2
    if (widthBudget < pageWidth) {
      pageWidth = widthBudget
      pageHeight = pageWidth / ratio
    }
  } else {
    const widthBudget = viewportW - horizPaddingExtra * 2
    if (widthBudget < pageWidth) {
      pageWidth = widthBudget
      pageHeight = pageWidth / ratio
    }
  }
  if (pageHeight <= 0 || pageWidth <= 0) return null

  const scale = pageHeight / mmToPx(dims.h)
  const padTop = mmToPx(settings.marginTop) * scale
  const padBottom = mmToPx(settings.marginBottom) * scale
  const padLeft = mmToPx(settings.marginLeft) * scale
  const padRight = mmToPx(settings.marginRight) * scale
  const innerHeight = pageHeight - padTop - padBottom

  return {
    width: pageWidth,
    height: pageHeight,
    padTop, padBottom, padLeft, padRight,
    innerHeight,
    gap
  }
}

function splitByHeight(heights, limit) {
  const groups = [[]]
  let used = 0
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i]
    const lastGroup = groups[groups.length - 1]
    if (used + h > limit && lastGroup.length > 0) {
      groups.push([])
      used = 0
    }
    groups[groups.length - 1].push(i)
    used += h
  }
  return groups
}

function createPaperPage() {
  const page = document.createElement('section')
  page.className = 'paper-page'
  return page
}

/* ─── Strip controller (virtual page-flip scroll) ────────────────────── */

class StripController {
  constructor(strip, layout, totalPages) {
    this.strip = strip
    this.layout = layout
    this.total = totalPages
    this.current = 0
    this.pagesPerView = layout === 'two-pages' ? 2 : 1
    this.boundWheel = this.onWheel.bind(this)
    this.boundKey = this.onKey.bind(this)
    this.viewport = strip.parentElement
    this.viewport.addEventListener('wheel', this.boundWheel, { passive: false })
    document.addEventListener('keydown', this.boundKey)
    this.update()
  }

  destroy() {
    if (this.viewport) this.viewport.removeEventListener('wheel', this.boundWheel)
    document.removeEventListener('keydown', this.boundKey)
  }

  onWheel(e) {
    if (e.shiftKey) return
    e.preventDefault()
    const dir = (e.deltaY > 0 || e.deltaX > 0) ? 1 : -1
    this.advance(dir)
  }

  onKey(e) {
    if (document.body.dataset.layout !== this.layout) return
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault(); this.advance(1)
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault(); this.advance(-1)
    } else if (e.key === 'Home') {
      e.preventDefault(); this.goTo(0)
    } else if (e.key === 'End') {
      e.preventDefault(); this.goTo(this.total - 1)
    }
  }

  advance(dir) {
    const step = this.pagesPerView
    const groupCount = Math.ceil(this.total / step)
    let groupIdx = Math.floor(this.current / step) + dir
    groupIdx = clamp(groupIdx, 0, groupCount - 1)
    this.goTo(groupIdx * step)
  }

  goTo(pageIdx) {
    this.current = clamp(pageIdx, 0, this.total - 1)
    this.update()
  }

  update() {
    const pages = this.strip.querySelectorAll('.paper-page')
    if (pages.length === 0) return
    const pageW = pages[0].offsetWidth
    const gap = 16
    const groupIdx = Math.floor(this.current / this.pagesPerView)
    const offset = groupIdx * (pageW * this.pagesPerView + gap * this.pagesPerView)
    this.strip.style.transform = `translateX(-${offset}px)`
    updatePageIndicatorFromController(this.current, this.total, this.layout)
  }
}

function updatePageIndicatorFromController(current, total, layout) {
  const indicator = document.getElementById('page-indicator')
  if (!indicator) return
  const elC = indicator.querySelector('#page-current')
  const elT = indicator.querySelector('#page-total')
  if (!elC || !elT) return
  if (layout === 'two-pages') {
    const start = current + 1
    const end = Math.min(start + 1, total)
    elC.textContent = start === end ? `${start}` : `${start}–${end}`
  } else {
    elC.textContent = String(current + 1)
  }
  elT.textContent = String(total)
  indicator.hidden = false
}

/* ─── Page indicator (horizontal/two-pages) ─────────────────────────── */

let resizeReflowTimer = null

function setupPageIndicatorListeners() {
  window.addEventListener('resize', () => {
    if (resizeReflowTimer) clearTimeout(resizeReflowTimer)
    resizeReflowTimer = setTimeout(() => {
      applyLayoutPagination()
      updatePageIndicator()
    }, 150)
  })
}

function updatePageIndicator() {
  const indicator = document.getElementById('page-indicator')
  if (!indicator) return
  const layout = document.body.dataset.layout
  const isHorizontal = layout === 'horizontal' || layout === 'two-pages'
  if (!isHorizontal || !stripController) {
    indicator.hidden = true
    return
  }
  // StripController.update() already updates indicator content; just ensure visible
  indicator.hidden = false
}

function isPreviewHost() {
  const h = location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0'
}

function connectLiveReload() {
  let backoff = 500
  const open = () => {
    const es = new EventSource('events')
    es.addEventListener('hello', () => {
      backoff = 500
      showLiveBadge('connected')
    })
    const reload = async () => {
      try {
        await loadManifest()
        await render()
        flashLiveBadge()
      } catch (err) {
        console.warn('notedrop live reload 실패', err)
      }
    }
    es.addEventListener('added', reload)
    es.addEventListener('changed', reload)
    es.addEventListener('removed', reload)
    es.onerror = () => {
      es.close()
      showLiveBadge('reconnecting')
      setTimeout(open, backoff)
      backoff = Math.min(backoff * 2, 5000)
    }
  }
  open()
}

function showLiveBadge(state) {
  let el = document.getElementById('live-badge')
  if (!el) {
    el = document.createElement('div')
    el.id = 'live-badge'
    el.style.cssText = 'position:fixed;right:12px;bottom:12px;padding:0.3rem 0.6rem;border-radius:999px;font:600 11px/1 -apple-system,BlinkMacSystemFont,sans-serif;color:white;z-index:1000;letter-spacing:0.05em;text-transform:uppercase;transition:opacity 0.3s,background 0.3s;'
    document.body.appendChild(el)
  }
  if (state === 'connected') {
    el.textContent = 'LIVE'
    el.style.background = '#16a34a'
    el.style.opacity = '0.8'
  } else if (state === 'reconnecting') {
    el.textContent = 'reconnecting…'
    el.style.background = '#a16207'
    el.style.opacity = '0.85'
  }
}

function flashLiveBadge() {
  const el = document.getElementById('live-badge')
  if (!el) return
  el.style.background = '#0ea5e9'
  el.textContent = 'updated'
  setTimeout(() => showLiveBadge('connected'), 800)
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
  let result
  if (route.kind === 'home') result = renderHome()
  else if (route.kind === 'entry') result = renderEntry(route.hash, route.chapter)
  else { showError(new Error('알 수 없는 경로')); return }
  await Promise.resolve(result)
  requestAnimationFrame(() => {
    applyLayoutPagination()
    updatePageIndicator()
  })
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
    .join('<span class="crumb-sep">/</span>')
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

// Boot — run AFTER all const/function declarations so View Settings consts are initialized
setupViewSettings()
setupPageIndicatorListeners()
window.addEventListener('hashchange', render)
init().catch((err) => showError(err))
