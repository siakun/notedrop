/**
 * viewer 측 진단 로거. plugin 의 FileLogger 와 비슷하지만 브라우저 환경이라
 * 파일 append 불가능 — console 만. Debug mode 일 때 verbose, 평소엔 warn/error.
 *
 * Debug mode 활성화 방법:
 *  - URL: `?debug=1` query param
 *  - localStorage: `notedrop:debug = '1'`
 *  - 또는 코드에서 setDebugMode(true)
 *
 * 활성화 후 새로고침 → 모든 logger.debug/info 가 console 출력.
 */

const STORAGE_KEY = 'notedrop:debug'

let debugMode: boolean | null = null

function readDebugMode(): boolean {
  if (typeof window === 'undefined') return false
  if (debugMode !== null) return debugMode
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('debug') === '1') {
      debugMode = true
      try { window.localStorage.setItem(STORAGE_KEY, '1') } catch {}
      return true
    }
    const stored = window.localStorage.getItem(STORAGE_KEY)
    debugMode = stored === '1'
    return debugMode
  } catch {
    debugMode = false
    return false
  }
}

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled
  if (typeof window === 'undefined') return
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, '1')
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export type LogCategory =
  | 'manifest'
  | 'content'
  | 'paginate'
  | 'sse'
  | 'route'
  | 'view-settings'
  | 'mermaid'
  | 'markdown'

function format(
  level: string,
  category: LogCategory,
  message: string,
  data?: unknown
): unknown[] {
  const prefix = `[notedrop ${level}] [${category}]`
  if (data === undefined) return [prefix, message]
  return [prefix, message, data]
}

export const logger = {
  debug(category: LogCategory, message: string, data?: unknown): void {
    if (!readDebugMode()) return
    console.log(...format('DEBUG', category, message, data))
  },
  info(category: LogCategory, message: string, data?: unknown): void {
    if (!readDebugMode()) return
    console.log(...format('INFO', category, message, data))
  },
  warn(category: LogCategory, message: string, data?: unknown): void {
    console.warn(...format('WARN', category, message, data))
  },
  error(category: LogCategory, message: string, data?: unknown): void {
    console.error(...format('ERROR', category, message, data))
  }
}
