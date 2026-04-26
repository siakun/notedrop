import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

export type EventLoggerOptions = {
  logPath: string
  pluginVersion: string
}

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
  constructor(private readonly options: EventLoggerOptions) {}

  newTraceId(): string {
    return randomUUID()
  }

  async emit(
    type: string,
    data?: Record<string, unknown>,
    traceId?: string
  ): Promise<void> {
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
    try {
      await fs.appendFile(this.options.logPath, line, 'utf-8')
    } catch (err) {
      console.warn('notedrop EventLogger: append 실패', err)
    }
  }
}
