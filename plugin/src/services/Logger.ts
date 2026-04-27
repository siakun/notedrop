import fs from 'node:fs/promises'
import path from 'node:path'
import type { App, FileSystemAdapter } from 'obsidian'
import { redactSecrets as sharedRedactSecrets } from './SecretMasking.js'

/**
 * 진단 로거. 항상 console 출력 + debug mode 일 때만 파일 append.
 *
 * 파일 위치: `<vault>/.obsidian/plugins/notedrop/notedrop.log`
 *
 * 사용처 (publish + preview + setup) 의 모든 진단 정보를 한 곳에 누적.
 * 사용자가 dogfood 중 mismatch 또는 fail 발생 시 파일 첨부로 보고 가능.
 */
export interface Logger {
  debug(category: string, message: string, data?: Record<string, unknown>): void
  info(category: string, message: string, data?: Record<string, unknown>): void
  warn(category: string, message: string, data?: Record<string, unknown>): void
  error(category: string, message: string, data?: Record<string, unknown>): void
}

export type LoggerOptions = {
  app: App
  pluginId: string
  isDebugMode: () => boolean
  pluginVersion: string
}

const MAX_LOG_BYTES = 10 * 1024 * 1024 // 10 MB rotation 한계

export class FileLogger implements Logger {
  private logPath: string | null = null
  private pendingWrites: Promise<void>[] = []

  constructor(private readonly options: LoggerOptions) {
    const adapter = options.app.vault.adapter as FileSystemAdapter
    if (typeof adapter.getBasePath === 'function') {
      const basePath = adapter.getBasePath()
      this.logPath = path.join(
        basePath,
        '.obsidian',
        'plugins',
        options.pluginId,
        'notedrop.log'
      )
    }
  }

  debug(category: string, message: string, data?: Record<string, unknown>): void {
    this.write('DEBUG', category, message, data)
  }

  info(category: string, message: string, data?: Record<string, unknown>): void {
    this.write('INFO', category, message, data)
  }

  warn(category: string, message: string, data?: Record<string, unknown>): void {
    this.write('WARN', category, message, data)
  }

  error(category: string, message: string, data?: Record<string, unknown>): void {
    this.write('ERROR', category, message, data)
  }

  private write(
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    category: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    const line = this.formatLine(level, category, message, data)
    // console 은 항상 (DevTools 콘솔에서 즉시 확인)
    const consoleFn =
      level === 'ERROR' ? console.error
      : level === 'WARN' ? console.warn
      : console.log
    consoleFn(line.trim())
    // file 은 debug mode 일 때만 (사용자가 명시 활성화)
    if (this.options.isDebugMode() && this.logPath) {
      const p = this.appendToFile(line)
      this.pendingWrites.push(p)
      void p.finally(() => {
        const idx = this.pendingWrites.indexOf(p)
        if (idx >= 0) this.pendingWrites.splice(idx, 1)
      })
    }
  }

  private formatLine(
    level: string,
    category: string,
    message: string,
    data?: Record<string, unknown>
  ): string {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level}] [v${this.options.pluginVersion}] [${category}]`
    if (!data || Object.keys(data).length === 0) {
      return `${prefix} ${message}\n`
    }
    let dataStr: string
    try {
      dataStr = JSON.stringify(data, redactSecrets, 2)
    } catch {
      dataStr = '<unserializable>'
    }
    return `${prefix} ${message}\n${indent(dataStr, 2)}\n`
  }

  private async appendToFile(line: string): Promise<void> {
    if (!this.logPath) return
    try {
      // 10MB 초과 시 .log.1 으로 rotate (한 번만)
      try {
        const stat = await fs.stat(this.logPath)
        if (stat.size > MAX_LOG_BYTES) {
          const rotatedPath = `${this.logPath}.1`
          try { await fs.unlink(rotatedPath) } catch {}
          await fs.rename(this.logPath, rotatedPath)
        }
      } catch {
        // file 없으면 stat 실패 — 무시 (append 가 새로 생성)
      }
      await fs.appendFile(this.logPath, line, 'utf-8')
    } catch (err) {
      console.warn('notedrop FileLogger: append 실패', err)
    }
  }

  /** plugin onunload 시 호출. pending fs.appendFile 모두 끝날 때까지 await. */
  async flush(): Promise<void> {
    await Promise.all(this.pendingWrites)
  }
}

/**
 * console 만 출력하는 logger (debug mode 비활성 시 동작과 동일하지만
 * adapter 가 FileSystemAdapter 가 아닐 때 또는 테스트용).
 */
export class ConsoleLogger implements Logger {
  constructor(private readonly version: string) {}

  debug(category: string, message: string, data?: Record<string, unknown>): void {
    console.log(this.format('DEBUG', category, message, data))
  }
  info(category: string, message: string, data?: Record<string, unknown>): void {
    console.log(this.format('INFO', category, message, data))
  }
  warn(category: string, message: string, data?: Record<string, unknown>): void {
    console.warn(this.format('WARN', category, message, data))
  }
  error(category: string, message: string, data?: Record<string, unknown>): void {
    console.error(this.format('ERROR', category, message, data))
  }
  private format(level: string, category: string, message: string, data?: Record<string, unknown>): string {
    const prefix = `[${level}] [v${this.version}] [${category}] ${message}`
    if (!data) return prefix
    try {
      return `${prefix}\n${JSON.stringify(data, redactSecrets, 2)}`
    } catch {
      return prefix
    }
  }
}

/**
 * JSON.stringify replacer — secret 필드 mask. PAT, token 등이 로그에
 * 새어나가지 않도록.
 */
function redactSecrets(key: string, value: unknown): unknown {
  return sharedRedactSecrets(key, value)
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => pad + line)
    .join('\n')
}
