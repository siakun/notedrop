const STYLE_PREFIX = 'notedrop-page-css-'

export function injectPageCss(hash: string, rawCss: string): void {
  if (typeof document === 'undefined') return
  removePageCss(hash)
  if (!rawCss.trim()) return
  const style = document.createElement('style')
  style.id = `${STYLE_PREFIX}${hash}`
  style.setAttribute('data-page-hash', hash)
  style.textContent = scopeCss(rawCss)
  document.head.appendChild(style)
}

export function removePageCss(hash: string): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(`${STYLE_PREFIX}${hash}`)
  if (existing) existing.remove()
}

export function clearAllPageCss(): void {
  if (typeof document === 'undefined') return
  document
    .querySelectorAll(`style[id^="${STYLE_PREFIX}"]`)
    .forEach((node) => node.remove())
}

const SELECTOR_PART_RE = /([^,{]+)(\s*[,{])/g

export function scopeCss(css: string): string {
  return css.replace(SELECTOR_PART_RE, (_match, selectorPart: string, terminator: string) => {
    const trimmed = selectorPart.trim()
    if (!trimmed) return selectorPart + terminator
    if (trimmed.startsWith('@')) return selectorPart + terminator
    if (trimmed.startsWith('.notedrop-content')) return selectorPart + terminator
    if (trimmed.startsWith('from') || trimmed.startsWith('to')) return selectorPart + terminator
    if (/^\d/.test(trimmed)) return selectorPart + terminator
    const prefixed = trimmed
      .split(/\s+/)
      .map((token, idx) => (idx === 0 ? `.notedrop-content ${token}` : token))
      .join(' ')
    return prefixed + terminator.replace(/^\s+/, '')
  })
}
