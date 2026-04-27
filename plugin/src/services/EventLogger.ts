import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { redactSecrets } from './SecretMasking.js'

export type EventLoggerOptions = {
  logPath: string
  pluginVersion: string
  isEnabled?: () => boolean
}

export class EventLogger {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly options: EventLoggerOptions) {
    if (!options.logPath) {
      console.warn('notedrop EventLogger: logPath empty, emit() is a no-op')
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
    if (this.options.isEnabled && !this.options.isEnabled()) return
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
      line = JSON.stringify(entry, redactSecrets) + '\n'
    } catch {
      line = JSON.stringify({
        timestamp: entry.timestamp,
        version: entry.version,
        type,
        traceId,
        data: '<unserializable>'
      }) + '\n'
    }

    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await fs.appendFile(this.options.logPath, line, 'utf-8')
      } catch (err) {
        console.warn('notedrop EventLogger: append failed', err)
      }
    })
    await this.writeQueue
  }
}
