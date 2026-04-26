import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

export type EventLoggerOptions = {
  logPath: string
  pluginVersion: string
}

// Mirror of Logger.ts redactSecrets — keep in sync if adding keys.
// Pre-lowercased here (cleaner than mixed-case + toLowerCase in Logger.ts:157).
const SECRET_KEYS = ['githubpat', 'token', 'pat', 'authorization', 'auth']

function maskSecrets(key: string, value: unknown): unknown {
  if (SECRET_KEYS.includes(key.toLowerCase()) && typeof value === 'string') {
    if (value.length === 0) return ''
    if (value.length <= 8) return '***'
    return `${value.slice(0, 4)}***${value.slice(-2)}`
  }
  return value
}

export class EventLogger {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly options: EventLoggerOptions) {
    // Issue 3: empty logPath 가 들어오면 emit() no-op + 한 번 warn
    if (!options.logPath) {
      console.warn('notedrop EventLogger: logPath empty, emit() 가 no-op')
    }
  }

  newTraceId(): string {
    return randomUUID()
  }

  async emit(
    type: string,
    data?: Record<string, unknown>,
    traceId?: string
  ): Promise<void> {
    if (!this.options.logPath) return
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      version: this.options.pluginVersion,
      type
    }
    if (traceId) entry.traceId = traceId
    if (data) entry.data = data
    let line: string
    try {
      line = JSON.stringify(entry, maskSecrets) + '\n'
    } catch {
      line = JSON.stringify({
        timestamp: entry.timestamp,
        version: entry.version,
        type,
        traceId,
        data: '<unserializable>'
      }) + '\n'
    }
    // 직렬화 — Windows 에서 line interleaving 회피
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await fs.appendFile(this.options.logPath, line, 'utf-8')
      } catch (err) {
        console.warn('notedrop EventLogger: append 실패', err)
      }
    })
    await this.writeQueue
  }
}
