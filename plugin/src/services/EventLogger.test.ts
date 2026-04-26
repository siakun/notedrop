import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { EventLogger } from './EventLogger.js'

describe('EventLogger', () => {
  let tmpDir: string
  let logPath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'el-test-'))
    logPath = path.join(tmpDir, 'events.jsonl')
  })

  it('emit() 의 entry 가 NDJSON 1줄로 file 에 기록됨', async () => {
    const logger = new EventLogger({ logPath, pluginVersion: '0.1.47' })
    await logger.emit('test_event', { foo: 'bar' })
    const content = await fs.readFile(logPath, 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0])
    expect(entry).toMatchObject({
      type: 'test_event',
      version: '0.1.47',
      data: { foo: 'bar' }
    })
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(entry.traceId).toBeUndefined()
  })

  it('newTraceId() 등록한 ID 가 유효 UUID v4', () => {
    const logger = new EventLogger({ logPath, pluginVersion: '0.1.47' })
    const id = logger.newTraceId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('emit() 에 traceId 전달 시 entry 에 포함', async () => {
    const logger = new EventLogger({ logPath, pluginVersion: '0.1.47' })
    const tid = logger.newTraceId()
    await logger.emit('publish_started', { mode: 'smart' }, tid)
    const content = await fs.readFile(logPath, 'utf-8')
    const entry = JSON.parse(content.trim())
    expect(entry.traceId).toBe(tid)
  })

  it('githubPat 포함 data 는 자동 마스킹', async () => {
    const logger = new EventLogger({ logPath, pluginVersion: '0.1.47' })
    await logger.emit('settings_dump', { githubPat: 'ghp_abcdefghij1234567890', foo: 'visible' })
    const content = await fs.readFile(logPath, 'utf-8')
    const entry = JSON.parse(content.trim())
    expect(entry.data.githubPat).toBe('ghp_***90')
    expect(entry.data.foo).toBe('visible')
  })
})
