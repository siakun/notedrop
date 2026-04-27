# Dogfood Automation Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** notedrop plugin 에 *debugMode 게이트* dogfood 자동화 instrumentation 등록 — AI 세션이 vault 안 plugin 의 internal state 를 안전하게 dump·시나리오 강제·명령 실행 결과 추적 가능하도록 권한 최대화. 위험 명령 (baseline reset, cache key 강제, share repo cleanup) 은 debugMode==true 시만 등록.

**Architecture:** 신규 `EventLogger` service 가 `events.jsonl` (NDJSON) 등록 — 기존 `notedrop.log` 와 분리해 AI 세션 polling/parse 안정. `ctx.devSnapshot()` API 가 internal state (settings, dirtyTracker plan, seedPersistence index) 전체 마스킹 dump. 신규 `commands/dogfood/` 디렉토리가 시나리오 명령 8개 등록. `main.ts` 의 명령 등록 루프에 `debugMode` 분기 등록 — production 사용자에게 dogfood 명령 노출 없음.

**Tech Stack:** TypeScript + esbuild (plugin bundler), vitest (unit tests), Obsidian Plugin API (`addCommand`, `app.vault.adapter`), `node:fs/promises` (file I/O), Web Crypto `randomUUID` (trace ID).

---

## Scope Notes

- 본 plan 은 *plugin 코드* 만. viewer / share repo / GH Pages 변경 없음
- v0.1.47 release 까지 등록 (manifest.json 의 version + main.ts 의 PLUGIN_VERSION + ADR + spec)
- ADR-0028 작성 — debugMode-gated dev API 정당화
- spec arc42 §13 dogfood-ux-requirements 갱신 (§14 추가 vs §13 갱신 — Task 12 안 결정)
- worktree 없음 — 본 main 에서 직접 branch (auto mode + 사용자 권한 명시)

## File Structure

**Create:**

| 경로 | 책임 |
|---|---|
| `plugin/src/services/EventLogger.ts` | events.jsonl NDJSON append + traceId 발급 |
| `plugin/src/services/EventLogger.test.ts` | EventLogger unit test |
| `plugin/src/services/DevSnapshot.ts` | ctx 안 internal state 전체 dump (마스킹) |
| `plugin/src/services/DevSnapshot.test.ts` | DevSnapshot unit test |
| `plugin/src/commands/dogfood/registry.ts` | DOGFOOD_COMMAND_REGISTRY (debugMode 게이트) |
| `plugin/src/commands/dogfood/dumpState.ts` | dump-state 명령 |
| `plugin/src/commands/dogfood/resetCache.ts` | reset-cache 명령 |
| `plugin/src/commands/dogfood/fakeFingerprint.ts` | fake-fingerprint 명령 |
| `plugin/src/commands/dogfood/resetBaseline.ts` | reset-baseline 명령 (dogfood 별도) |
| `plugin/src/commands/dogfood/exportBaseline.ts` | export-baseline 명령 |
| `plugin/src/commands/dogfood/triggerPublishWithTrace.ts` | publish + trace 명령 |
| `plugin/src/commands/dogfood/cleanupStaleBuildId.ts` | share repo cleanup 명령 |
| `plugin/src/commands/dogfood/dumpLogTail.ts` | log tail 출력 |
| `docs/decisions/0028-dogfood-automation-instrumentation.md` | ADR |

**Modify:**

| 경로 | 변경 |
|---|---|
| `plugin/src/services/PluginContext.ts:25-43` | `eventLogger`, `devSnapshot` field 추가 |
| `plugin/src/main.ts:24` | `PLUGIN_VERSION = '0.1.47'` |
| `plugin/src/main.ts:65-100` | EventLogger + DevSnapshot 인스턴스화 + ctx 주입 |
| `plugin/src/main.ts:121-129` | 명령 등록 루프에 `if (debugMode)` 분기 추가 |
| `plugin/src/services/Logger.ts:101-119` | `appendToFile` 가 await 보장 (race 제거) |
| `plugin/src/infrastructure/PreviewServer.ts` | preview console.error → eventLogger.emit('preview_error') mirror |
| `plugin/manifest.json` | version 0.1.46 → 0.1.47 |
| `manifest.json` (repo root) | version 0.1.46 → 0.1.47 |
| `versions.json` (repo root) | 0.1.47 entry 기록 |
| `docs/13-dogfood-ux-requirements.md` (또는 신규 §14) | dogfood automation instrumentation 등록 |
| `.claude/skills/notedrop-dogfood-automation/SKILL.md` | 신규 명령 + events.jsonl 패턴 등록 |

---

## Task 1: EventLogger service (events.jsonl 인프라)

**Files:**
- Create: `plugin/src/services/EventLogger.ts`
- Create: `plugin/src/services/EventLogger.test.ts`

- [ ] **Step 1.1: failing test 작성**

```typescript
// plugin/src/services/EventLogger.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
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
```

- [ ] **Step 1.2: test 실패 확인**

```bash
cd plugin && npx vitest run src/services/EventLogger.test.ts
```

Expected: FAIL — `Cannot find module './EventLogger.js'`

- [ ] **Step 1.3: EventLogger 구현**

```typescript
// plugin/src/services/EventLogger.ts
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
```

- [ ] **Step 1.4: test 통과 확인**

```bash
cd plugin && npx vitest run src/services/EventLogger.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 1.5: commit**

```bash
git add plugin/src/services/EventLogger.ts plugin/src/services/EventLogger.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(plugin): EventLogger — events.jsonl NDJSON + traceId 발급

dogfood 자동화 instrumentation 1/N. 기존 notedrop.log (사람-가독)
와 별도로 NDJSON file (events.jsonl) 기록. AI 세션 polling/parse
안정. githubPat/token 자동 마스킹.
EOF
)"
```

---

## Task 2: DevSnapshot API (internal state 전체 dump)

**Files:**
- Create: `plugin/src/services/DevSnapshot.ts`
- Create: `plugin/src/services/DevSnapshot.test.ts`

- [ ] **Step 2.1: failing test 작성**

```typescript
// plugin/src/services/DevSnapshot.test.ts
import { describe, it, expect } from 'vitest'
import { buildDevSnapshot } from './DevSnapshot.js'
import type { PluginSettings } from '../settings/PluginSettings.js'

describe('buildDevSnapshot', () => {
  const settings: PluginSettings = {
    githubPat: 'ghp_secret123456789',
    targetRepo: 'siakun/notedrop-share',
    targetBranch: 'main',
    publicRoot: '',
    publishViewerAssets: true,
    previewPort: 4321,
    autoStartPreview: false,
    autoUnpublish: false,
    publishedSeeds: [],
    unpublishedChanges: false,
    lastPublishedDigest: 'abc123',
    lastPublishedFiles: { 'a.md': { hash: 'h1', text: null } },
    lastViewerCacheKey: 'cache-key-xyz',
    debugMode: true
  }

  it('settings 의 githubPat 가 마스킹 존재', () => {
    const snap = buildDevSnapshot({ settings, indexedNoteCount: 5, dirtyMarked: false })
    expect(snap.settings.githubPat).toBe('ghp_***89')
    expect(snap.settings.targetRepo).toBe('siakun/notedrop-share')
  })

  it('lastPublishedFiles 전체 노출 안 함 (count 만)', () => {
    const snap = buildDevSnapshot({ settings, indexedNoteCount: 5, dirtyMarked: false })
    expect(snap.settings.lastPublishedFiles).toBeUndefined()
    expect(snap.baselineFileCount).toBe(1)
  })

  it('plugin meta + index/dirty 존재', () => {
    const snap = buildDevSnapshot({ settings, indexedNoteCount: 7, dirtyMarked: true })
    expect(snap.indexedNoteCount).toBe(7)
    expect(snap.dirtyMarked).toBe(true)
    expect(snap.hasBaseline).toBe(true)
    expect(snap.viewerCacheKeySet).toBe(true)
  })
})
```

- [ ] **Step 2.2: test 실패 확인**

```bash
cd plugin && npx vitest run src/services/DevSnapshot.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 2.3: DevSnapshot 구현**

```typescript
// plugin/src/services/DevSnapshot.ts
import type { PluginSettings } from '../settings/PluginSettings.js'

const SECRET_KEYS = ['githubPat']

export type DevSnapshot = {
  settings: Omit<PluginSettings, 'lastPublishedFiles'> & {
    lastPublishedFiles?: undefined
  }
  baselineFileCount: number
  hasBaseline: boolean
  viewerCacheKeySet: boolean
  indexedNoteCount: number
  dirtyMarked: boolean
}

export type DevSnapshotInput = {
  settings: PluginSettings
  indexedNoteCount: number
  dirtyMarked: boolean
}

export function buildDevSnapshot(input: DevSnapshotInput): DevSnapshot {
  const { settings } = input
  const masked = { ...settings } as Record<string, unknown>
  for (const k of SECRET_KEYS) {
    const v = masked[k]
    if (typeof v === 'string' && v.length > 0) {
      masked[k] = v.length <= 8 ? '***' : `${v.slice(0, 4)}***${v.slice(-2)}`
    }
  }
  // lastPublishedFiles 전체 노출은 위험 (수십~수백 KB) → count 만
  const baselineFileCount = settings.lastPublishedFiles
    ? Object.keys(settings.lastPublishedFiles).length : 0
  delete masked.lastPublishedFiles
  return {
    settings: masked as DevSnapshot['settings'],
    baselineFileCount,
    hasBaseline: settings.lastPublishedDigest !== null
      || settings.lastPublishedFiles !== null,
    viewerCacheKeySet: settings.lastViewerCacheKey !== null,
    indexedNoteCount: input.indexedNoteCount,
    dirtyMarked: input.dirtyMarked
  }
}
```

- [ ] **Step 2.4: test 통과 확인**

```bash
cd plugin && npx vitest run src/services/DevSnapshot.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 2.5: commit**

```bash
git add plugin/src/services/DevSnapshot.ts plugin/src/services/DevSnapshot.test.ts
git commit -m "$(cat <<'EOF'
✨ feat(plugin): DevSnapshot — internal state 마스킹 dump

dogfood 자동화 2/N. settings 전체 dump 시 githubPat 자동 마스킹 +
lastPublishedFiles 는 count 만 (수백 KB 노출 회피). plugin meta
(indexedNoteCount, dirtyMarked, hasBaseline, viewerCacheKeySet) 추가.
EOF
)"
```

---

## Task 3: PluginContext + main.ts wire-up

**Files:**
- Modify: `plugin/src/services/PluginContext.ts:25-43`
- Modify: `plugin/src/main.ts:24,65-100,121-129`

- [ ] **Step 3.1: PluginContext type 확장**

`plugin/src/services/PluginContext.ts:1-43` 의 import + type 추가:

```typescript
// 기존 import 들 사이에 추가
import type { EventLogger } from './EventLogger.js'

// type PluginContext 안 (line 42 logger 다음에)
  logger: Logger
  eventLogger: EventLogger
  devSnapshot: () => Promise<import('./DevSnapshot.js').DevSnapshot>
}
```

- [ ] **Step 3.2: main.ts 의 PLUGIN_VERSION + EventLogger 인스턴스화**

`plugin/src/main.ts:24` 변경:

```typescript
const PLUGIN_VERSION = '0.1.47'
```

`plugin/src/main.ts:65-100` 의 ctx 빌드 영역에 등록 (logger 다음):

```typescript
    // 기존 logger 등록 (line 65-70)
    const logger = new FileLogger({
      app: this.app,
      pluginId: 'notedrop',
      pluginVersion: PLUGIN_VERSION,
      isDebugMode: () => this.settings.debugMode
    })

    // === 신규: EventLogger ===
    const adapter = this.app.vault.adapter as import('obsidian').FileSystemAdapter
    const eventLogPath = adapter.getBasePath
      ? `${adapter.getBasePath()}/.obsidian/plugins/notedrop/events.jsonl`
      : ''
    const eventLogger = new EventLogger({
      logPath: eventLogPath,
      pluginVersion: PLUGIN_VERSION
    })

    // === 신규: devSnapshot factory ===
    const devSnapshotFn = async () => {
      const { buildDevSnapshot } = await import('./services/DevSnapshot.js')
      return buildDevSnapshot({
        settings: this.settings,
        indexedNoteCount: index.list().length,
        dirtyMarked: this.settings.unpublishedChanges
      })
    }

    // ... 기존 buildPlan/dirtyTracker 등록 ...

    this.ctx = {
      // ... 기존 field들 ...
      logger,
      eventLogger,
      devSnapshot: devSnapshotFn
    }
```

상단 import 추가 (line 21 다음):

```typescript
import { EventLogger } from './services/EventLogger.js'
```

- [ ] **Step 3.3: onload 끝에 lifecycle event 기록**

`plugin/src/main.ts:102-114` 의 logger.info('lifecycle', ...) 다음에:

```typescript
    void eventLogger.emit('lifecycle_onload', {
      version: PLUGIN_VERSION,
      debugMode: this.settings.debugMode,
      hasBaseline: this.settings.lastPublishedDigest !== null,
      baselineFileCount: this.settings.lastPublishedFiles
        ? Object.keys(this.settings.lastPublishedFiles).length : 0,
      viewerCacheKeySet: this.settings.lastViewerCacheKey !== null,
      indexedNoteCountAtLoad: 0  // build 전이라 0, build 후 update 별도
    })
```

- [ ] **Step 3.4: 빌드 통과 확인**

```bash
cd plugin && npm run build
```

Expected: PASS — esbuild 산출물 main.js 존재

- [ ] **Step 3.5: commit**

```bash
git add plugin/src/services/PluginContext.ts plugin/src/main.ts
git commit -m "$(cat <<'EOF'
🔧 chore(plugin): EventLogger + devSnapshot 을 ctx 주입 + v0.1.47

main.ts 가 EventLogger 인스턴스화하고 ctx 주입. onload 끝에
lifecycle_onload event 기록. devSnapshot factory function 등록.
PLUGIN_VERSION 0.1.47 갱신.
EOF
)"
```

---

## Task 4: dogfood command 인프라 + debugMode 게이트

**Files:**
- Create: `plugin/src/commands/dogfood/registry.ts`
- Modify: `plugin/src/main.ts:121-129`

- [ ] **Step 4.1: registry 작성 (placeholder 등록)**

```typescript
// plugin/src/commands/dogfood/registry.ts
import type { CommandDef } from '../types.js'

/**
 * Dogfood 명령 — debugMode==true 시만 등록.
 *
 * 위험한 명령 (baseline reset, cache key 강제, share repo cleanup) 을
 * production 사용자에게 노출하지 않기 위함. AI 세션 (notedrop-dogfood
 * automation skill) 가 호출.
 *
 * 모든 명령은 events.jsonl 에 entry 기록 (외부 polling/parse 안정).
 */
export const DOGFOOD_COMMAND_REGISTRY: readonly CommandDef[] = [
  // Task 5-9 에서 등록
]
```

- [ ] **Step 4.2: main.ts 에 debugMode 분기 등록**

`plugin/src/main.ts:121-129` 변경:

```typescript
    // 기존 production 명령
    for (const cmd of COMMAND_REGISTRY) {
      this.addCommand({
        id: cmd.id,
        name: cmd.name,
        callback: () => {
          void cmd.callback(this.ctx)
        }
      })
    }

    // dogfood 명령 — debugMode==true 시만 등록
    if (this.settings.debugMode) {
      const { DOGFOOD_COMMAND_REGISTRY } = await import('./commands/dogfood/registry.js')
      for (const cmd of DOGFOOD_COMMAND_REGISTRY) {
        this.addCommand({
          id: cmd.id,
          name: cmd.name,
          callback: () => {
            void cmd.callback(this.ctx)
          }
        })
      }
      logger.info('lifecycle', 'dogfood commands registered', {
        count: DOGFOOD_COMMAND_REGISTRY.length
      })
    }
```

⚠️ debugMode 변경 시 명령 visibility 갱신 의무 → settings tab 안 안내 또는 plugin reload. Task 10 에서 등록.

- [ ] **Step 4.3: 빌드 + reload 검증**

```bash
cd plugin && npm run build
```

Expected: PASS. (실 reload + 명령 등록 확인은 Task 5 다음 통합 검증 시)

- [ ] **Step 4.4: commit**

```bash
git add plugin/src/commands/dogfood/registry.ts plugin/src/main.ts
git commit -m "$(cat <<'EOF'
✨ feat(plugin): dogfood command registry + debugMode 게이트

명령 등록 루프에 debugMode 분기. production 사용자에게 0 노출.
DOGFOOD_COMMAND_REGISTRY placeholder. 다음 task 부터 명령 등록.
EOF
)"
```

---

## Task 5: dogfood:dump-state 명령

**Files:**
- Create: `plugin/src/commands/dogfood/dumpState.ts`
- Modify: `plugin/src/commands/dogfood/registry.ts`

- [ ] **Step 5.1: dumpState 명령 등록**

```typescript
// plugin/src/commands/dogfood/dumpState.ts
import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

export async function dumpState(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  await ctx.eventLogger.emit('dogfood_dump_state_started', {}, traceId)
  const snap = await ctx.devSnapshot()
  await ctx.eventLogger.emit('dogfood_dump_state_completed', { snapshot: snap }, traceId)
  ctx.logger.info('dogfood', 'dump-state 등록', { traceId, baselineFileCount: snap.baselineFileCount })
  new Notice(`notedrop dogfood: state dumped (trace=${traceId.slice(0, 8)})`, 4000)
}

export const dumpStateCommand: CommandDef = {
  id: 'dogfood:dump-state',
  name: '[dogfood] Dump internal state to events.jsonl',
  callback: (ctx) => dumpState(ctx)
}
```

- [ ] **Step 5.2: registry 작성**

`plugin/src/commands/dogfood/registry.ts`:

```typescript
import type { CommandDef } from '../types.js'
import { dumpStateCommand } from './dumpState.js'

export const DOGFOOD_COMMAND_REGISTRY: readonly CommandDef[] = [
  dumpStateCommand
]
```

- [ ] **Step 5.3: 빌드 + commit**

```bash
cd plugin && npm run build
git add plugin/src/commands/dogfood/dumpState.ts plugin/src/commands/dogfood/registry.ts
git commit -m "$(cat <<'EOF'
✨ feat(plugin): dogfood:dump-state — devSnapshot 을 events.jsonl 기록

trace ID 발급 → started → devSnapshot → completed event 기록.
AI 세션이 events.jsonl 의 dogfood_dump_state_completed 마커 polling
후 snapshot.data 회수.
EOF
)"
```

---

## Task 6: dogfood:reset-cache + fake-fingerprint + reset-baseline 명령 (3개 묶음)

같은 패턴 (settings 갱신 후 saveSettings + emit) 이라 한 task 안 등록.

**Files:**
- Create: `plugin/src/commands/dogfood/resetCache.ts`
- Create: `plugin/src/commands/dogfood/fakeFingerprint.ts`
- Create: `plugin/src/commands/dogfood/resetBaseline.ts`
- Modify: `plugin/src/commands/dogfood/registry.ts`

- [ ] **Step 6.1: resetCache 등록**

```typescript
// plugin/src/commands/dogfood/resetCache.ts
import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

export async function resetCache(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  const before = ctx.settings.lastViewerCacheKey
  ctx.settings.lastViewerCacheKey = null
  await ctx.saveSettings()
  await ctx.eventLogger.emit('dogfood_reset_cache_completed', {
    previousKey: before ? before.slice(0, 16) + '…' : null
  }, traceId)
  new Notice(`notedrop dogfood: cache key reset (trace=${traceId.slice(0, 8)})`, 4000)
}

export const resetCacheCommand: CommandDef = {
  id: 'dogfood:reset-cache',
  name: '[dogfood] Reset viewer cache key (force cache miss)',
  callback: (ctx) => resetCache(ctx)
}
```

- [ ] **Step 6.2: fakeFingerprint 등록**

```typescript
// plugin/src/commands/dogfood/fakeFingerprint.ts
import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

const FAKE_KEY = 'dogfood-fake-fingerprint-' + 'deadbeef'.repeat(4)

export async function fakeFingerprint(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  ctx.settings.lastViewerCacheKey = FAKE_KEY
  await ctx.saveSettings()
  await ctx.eventLogger.emit('dogfood_fake_fingerprint_completed', {
    fakeKey: FAKE_KEY
  }, traceId)
  new Notice(`notedrop dogfood: fake fingerprint set — next publish 가 mismatch 검출 의무`, 6000)
}

export const fakeFingerprintCommand: CommandDef = {
  id: 'dogfood:fake-fingerprint',
  name: '[dogfood] Set fake viewer fingerprint (force mismatch)',
  callback: (ctx) => fakeFingerprint(ctx)
}
```

- [ ] **Step 6.3: resetBaseline 등록**

```typescript
// plugin/src/commands/dogfood/resetBaseline.ts
import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

export async function resetBaseline(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  const baselineFileCountBefore = ctx.settings.lastPublishedFiles
    ? Object.keys(ctx.settings.lastPublishedFiles).length : 0
  ctx.settings.lastPublishedDigest = null
  ctx.settings.lastPublishedFiles = null
  ctx.settings.lastViewerCacheKey = null
  ctx.settings.unpublishedChanges = true
  await ctx.saveSettings()
  await ctx.eventLogger.emit('dogfood_reset_baseline_completed', {
    baselineFileCountBefore
  }, traceId)
  new Notice(`notedrop dogfood: baseline reset (was ${baselineFileCountBefore} files)`, 6000)
}

export const resetBaselineCommand: CommandDef = {
  id: 'dogfood:reset-baseline',
  name: '[dogfood] Reset publish baseline (next publish = full push)',
  callback: (ctx) => resetBaseline(ctx)
}
```

- [ ] **Step 6.4: registry 갱신**

```typescript
import type { CommandDef } from '../types.js'
import { dumpStateCommand } from './dumpState.js'
import { resetCacheCommand } from './resetCache.js'
import { fakeFingerprintCommand } from './fakeFingerprint.js'
import { resetBaselineCommand } from './resetBaseline.js'

export const DOGFOOD_COMMAND_REGISTRY: readonly CommandDef[] = [
  dumpStateCommand,
  resetCacheCommand,
  fakeFingerprintCommand,
  resetBaselineCommand
]
```

- [ ] **Step 6.5: 빌드 + commit**

```bash
cd plugin && npm run build
git add plugin/src/commands/dogfood/
git commit -m "$(cat <<'EOF'
✨ feat(plugin): dogfood reset-cache/fake-fingerprint/reset-baseline 명령

3개 시나리오 강제 명령. 모두 events.jsonl 에 entry 기록 (trace ID).
- reset-cache: lastViewerCacheKey null (cache miss 강제)
- fake-fingerprint: 잘못된 key 설정 (mismatch 발생 검증)
- reset-baseline: 모든 baseline 필드 null (다음 publish = 일괄 push)
EOF
)"
```

---

## Task 7: dogfood:export-baseline + dump-log-tail (read-only) 명령

**Files:**
- Create: `plugin/src/commands/dogfood/exportBaseline.ts`
- Create: `plugin/src/commands/dogfood/dumpLogTail.ts`
- Modify: `plugin/src/commands/dogfood/registry.ts`

- [ ] **Step 7.1: exportBaseline 등록**

```typescript
// plugin/src/commands/dogfood/exportBaseline.ts
import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

export async function exportBaseline(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  const files = ctx.settings.lastPublishedFiles ?? {}
  // 전체 dump (수십 KB 가능). 호출자가 의도적으로 호출
  await ctx.eventLogger.emit('dogfood_export_baseline_completed', {
    digest: ctx.settings.lastPublishedDigest,
    fileCount: Object.keys(files).length,
    files: Object.fromEntries(
      Object.entries(files).map(([p, snap]) => [p, { hash: snap.hash, hasText: snap.text !== null }])
    )
  }, traceId)
  new Notice(`notedrop dogfood: baseline exported ${Object.keys(files).length} files (trace=${traceId.slice(0, 8)})`, 4000)
}

export const exportBaselineCommand: CommandDef = {
  id: 'dogfood:export-baseline',
  name: '[dogfood] Export baseline file mapping to events.jsonl',
  callback: (ctx) => exportBaseline(ctx)
}
```

- [ ] **Step 7.2: dumpLogTail 등록**

```typescript
// plugin/src/commands/dogfood/dumpLogTail.ts
import { Notice } from 'obsidian'
import type { FileSystemAdapter } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

const TAIL_LINES = 100

export async function dumpLogTail(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  const adapter = ctx.app.vault.adapter as FileSystemAdapter
  const logRelPath = '.obsidian/plugins/notedrop/notedrop.log'
  let tail = ''
  try {
    const exists = await adapter.exists(logRelPath)
    if (exists) {
      const content = await adapter.read(logRelPath)
      tail = content.split('\n').slice(-TAIL_LINES).join('\n')
    }
  } catch (err) {
    await ctx.eventLogger.emit('dogfood_dump_log_tail_failed', {
      error: err instanceof Error ? err.message : String(err)
    }, traceId)
    new Notice('notedrop dogfood: log tail dump 실패', 4000)
    return
  }
  await ctx.eventLogger.emit('dogfood_dump_log_tail_completed', {
    tailLineCount: tail.split('\n').length,
    tail
  }, traceId)
  new Notice(`notedrop dogfood: log tail dumped (${TAIL_LINES} lines)`, 4000)
}

export const dumpLogTailCommand: CommandDef = {
  id: 'dogfood:dump-log-tail',
  name: '[dogfood] Dump notedrop.log tail to events.jsonl',
  callback: (ctx) => dumpLogTail(ctx)
}
```

- [ ] **Step 7.3: registry 갱신 + 빌드 + commit**

```typescript
// registry.ts 등록
import { exportBaselineCommand } from './exportBaseline.js'
import { dumpLogTailCommand } from './dumpLogTail.js'

export const DOGFOOD_COMMAND_REGISTRY: readonly CommandDef[] = [
  dumpStateCommand,
  resetCacheCommand,
  fakeFingerprintCommand,
  resetBaselineCommand,
  exportBaselineCommand,
  dumpLogTailCommand
]
```

```bash
cd plugin && npm run build
git add plugin/src/commands/dogfood/
git commit -m "✨ feat(plugin): dogfood export-baseline + dump-log-tail 명령"
```

---

## Task 8: dogfood:trigger-publish-with-trace 명령

**Files:**
- Create: `plugin/src/commands/dogfood/triggerPublishWithTrace.ts`
- Modify: `plugin/src/commands/dogfood/registry.ts`

- [ ] **Step 8.1: 명령 등록**

```typescript
// plugin/src/commands/dogfood/triggerPublishWithTrace.ts
import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'
import { publishVault } from '../publishVault.js'
import { forcePublishVault } from '../forcePublishVault.js'

export async function triggerPublishWithTrace(
  ctx: PluginContext,
  mode: 'smart' | 'force'
): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  const t0 = Date.now()
  await ctx.eventLogger.emit('dogfood_publish_started', { mode }, traceId)
  try {
    if (mode === 'smart') await publishVault(ctx)
    else await forcePublishVault(ctx)
    await ctx.eventLogger.emit('dogfood_publish_completed', {
      mode,
      durationMs: Date.now() - t0
    }, traceId)
    new Notice(`notedrop dogfood: ${mode} publish 완료 (trace=${traceId.slice(0, 8)})`, 6000)
  } catch (err) {
    await ctx.eventLogger.emit('dogfood_publish_failed', {
      mode,
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err)
    }, traceId)
    new Notice(`notedrop dogfood: ${mode} publish 실패 — ${err}`, 8000)
  }
}

export const triggerPublishSmartCommand: CommandDef = {
  id: 'dogfood:trigger-publish-smart',
  name: '[dogfood] Trigger smart publish with trace',
  callback: (ctx) => triggerPublishWithTrace(ctx, 'smart')
}

export const triggerPublishForceCommand: CommandDef = {
  id: 'dogfood:trigger-publish-force',
  name: '[dogfood] Trigger force publish with trace',
  callback: (ctx) => triggerPublishWithTrace(ctx, 'force')
}
```

⚠️ 의무: `publishVault` / `forcePublishVault` 의 export 가 함수인지 확인. 현재 commands/publishVault.ts 등이 export 등록한지 의무 (CommandDef 안 callback 만 등록한 경우 named export 추가 의무).

- [ ] **Step 8.2: 기존 publishVault.ts 의 export 검토 + 의무 시 함수 추출**

```bash
grep -n "^export" plugin/src/commands/publishVault.ts
```

만약 `publishVaultCommand` 만 존재고 함수 존재지 않으면 함수 추출:

```typescript
// plugin/src/commands/publishVault.ts (예시 — 실제 구조에 맞춰 수정)
export async function publishVault(ctx: PluginContext): Promise<void> {
  // 기존 callback body
}
export const publishVaultCommand: CommandDef = {
  id: 'publish-vault',
  name: '...',
  callback: (ctx) => publishVault(ctx)
}
```

forcePublishVault 도 동일.

- [ ] **Step 8.3: registry 갱신 + 빌드**

```typescript
import { triggerPublishSmartCommand, triggerPublishForceCommand } from './triggerPublishWithTrace.js'

export const DOGFOOD_COMMAND_REGISTRY: readonly CommandDef[] = [
  // ... 기존 등록 ...
  triggerPublishSmartCommand,
  triggerPublishForceCommand
]
```

```bash
cd plugin && npm run build
```

- [ ] **Step 8.4: commit**

```bash
git add plugin/src/commands/
git commit -m "$(cat <<'EOF'
✨ feat(plugin): dogfood trigger-publish-{smart,force} 명령 + trace ID

publish 명령 wrapper. 시작/완료/실패 시점 events.jsonl 기록 +
durationMs 측정. AI 세션이 trace ID 매칭으로 외부 polling 가능.
publishVault/forcePublishVault 함수 export 등록 (callback wrap 분리).
EOF
)"
```

---

## Task 9: dogfood:cleanup-stale-buildid 명령 (위험 ↑↑)

**Files:**
- Create: `plugin/src/commands/dogfood/cleanupStaleBuildId.ts`
- Modify: `plugin/src/commands/dogfood/registry.ts`

⚠️ 위험 ↑↑: share repo 의 file 삭제. debugMode 게이트 + Notice 확인 필요. 본 task 수행 여부에 사용자 확인 의무 (Task 13 안 SKILL.md 직후 dogfood release 후 별도 검증).

- [ ] **Step 9.1: 명령 등록**

```typescript
// plugin/src/commands/dogfood/cleanupStaleBuildId.ts
import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

/**
 * share repo 의 _next/static/<buildId>/ 디렉토리 중 manifest 에 등록된
 * 현재 buildId 외 모두 cleanup. GitHub Tree API 의 sha=null 적용으로
 * file 삭제. 단일 atomic commit.
 *
 * 위험 ↑↑: share repo 손상 가능. 사용자 manual confirm 의무.
 */
export async function cleanupStaleBuildId(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  await ctx.eventLogger.emit('dogfood_cleanup_started', {}, traceId)
  // 구현: GitHubPublisher 의 fetchTree → currentBuildId 식별 → stale 추출 →
  //       Tree API 로 sha=null 등록한 새 tree commit
  // 현 plan 에선 stub 작성 — Task 13 후 별도 PR 처리 후보
  new Notice('notedrop dogfood: cleanup-stale-buildid not yet implemented (stub)', 6000)
  await ctx.eventLogger.emit('dogfood_cleanup_skipped', { reason: 'not_implemented' }, traceId)
}

export const cleanupStaleBuildIdCommand: CommandDef = {
  id: 'dogfood:cleanup-stale-buildid',
  name: '[dogfood] Cleanup stale buildId in share repo (DANGER)',
  callback: (ctx) => cleanupStaleBuildId(ctx)
}
```

⚠️ stub 작성 — 본 task 의 핵심은 *명령 자체 등록* + 추후 구현. 실 구현은 GitHubPublisher 확장 의무 (별도 plan 작성).

- [ ] **Step 9.2: registry 갱신 + 빌드 + commit**

```bash
cd plugin && npm run build
git add plugin/src/commands/dogfood/cleanupStaleBuildId.ts plugin/src/commands/dogfood/registry.ts
git commit -m "🚧 feat(plugin): dogfood cleanup-stale-buildid stub 작성 — 후속 plan 의무"
```

---

## Task 10: Logger.ts append race fix + settings tab debugMode 안내

**Files:**
- Modify: `plugin/src/services/Logger.ts:101-119`
- Modify: `plugin/src/settings/SettingsTab.ts` (debugMode toggle 안내)

- [ ] **Step 10.1: Logger appendToFile race fix**

`plugin/src/services/Logger.ts:62-79` 의 `write()` 변경 — `appendToFile` 의 promise 를 `pendingWrites` 에 추가해 onunload 시 await:

```typescript
export class FileLogger implements Logger {
  private logPath: string | null = null
  private pendingWrites: Promise<void>[] = []

  // ... 기존 constructor ...

  private write(level, category, message, data): void {
    const line = this.formatLine(level, category, message, data)
    const consoleFn = level === 'ERROR' ? console.error
      : level === 'WARN' ? console.warn : console.log
    consoleFn(line.trim())
    if (this.options.isDebugMode() && this.logPath) {
      const p = this.appendToFile(line)
      this.pendingWrites.push(p)
      p.finally(() => {
        const idx = this.pendingWrites.indexOf(p)
        if (idx >= 0) this.pendingWrites.splice(idx, 1)
      })
    }
  }

  /** plugin onunload 시 호출. pending append 모두 끝날 때까지 await. */
  async flush(): Promise<void> {
    await Promise.all(this.pendingWrites)
  }
}
```

`main.ts:153-158` onunload 변경:

```typescript
override async onunload(): Promise<void> {
  if (this.seedPersistence) await this.seedPersistence.stop()
  this.ctx?.bridge?.stop()
  await this.ctx?.preview?.stop()
  if (this.ctx?.logger && 'flush' in this.ctx.logger) {
    await (this.ctx.logger as { flush?: () => Promise<void> }).flush?.()
  }
  console.log('notedrop unloaded')
}
```

- [ ] **Step 10.2: SettingsTab 안 debugMode 안내 추가**

`plugin/src/settings/SettingsTab.ts` 의 debugMode toggle 위치에 description 추가:

```typescript
// 기존 toggle 추가
.setName('Debug mode')
.setDesc(
  '켜면 notedrop.log + events.jsonl 기록. dogfood 명령 (8개) 도 등록. ' +
  '⚠️ 변경 후 plugin reload 의무 (Settings → Community Plugins → notedrop 토글).'
)
```

- [ ] **Step 10.3: 빌드 + commit**

```bash
cd plugin && npm run build
git add plugin/src/services/Logger.ts plugin/src/main.ts plugin/src/settings/SettingsTab.ts
git commit -m "$(cat <<'EOF'
🐛 fix(plugin): Logger appendToFile race + debugMode 변경 reload 안내

reload 시 onunload 가 pending fs.appendFile 끝날 때까지 await 하도록
flush() 추가. 검증 시 onload log 손실 회피. SettingsTab 의 debugMode
toggle 에 reload 의무 안내 추가 (dogfood 명령 visibility 갱신).
EOF
)"
```

---

## Task 11: Preview console mirror

**Files:**
- Modify: `plugin/src/infrastructure/PreviewServer.ts`

- [ ] **Step 11.1: PreviewServer 의 console.error/console.warn → eventLogger.emit mirror**

PreviewServer 가 ctx 주입 의무 (현재 안 존재으면 wire-up 등록). 또는 별도 errorHandler 등록.

```typescript
// PreviewServer 안 (또는 wire-up 시 등록)
private emitError(category: string, msg: string, data?: Record<string, unknown>): void {
  console.error(`[preview] ${msg}`, data)
  // eventLogger 가 wire-up 존재으면 emit
  this.options.onPreviewError?.(category, msg, data)
}
```

main.ts 의 PreviewServer 인스턴스화 위치 (line 60-62):

```typescript
const preview = new PreviewServer(orchestrator, vault, index, {
  port: this.settings.previewPort,
  onPreviewError: (category, msg, data) => {
    void eventLogger.emit('preview_error', { category, msg, ...(data || {}) })
  }
})
```

⚠️ 의무: PreviewServer 의 internal console.error/warn 호출 위치들 (start/stop 실패, request 처리 실패 등) 모두 emitError 로 교체. *부분* 적용 가능 (가장 자주 등록된 error path 만).

- [ ] **Step 11.2: 빌드 + commit**

```bash
cd plugin && npm run build
git add plugin/src/infrastructure/PreviewServer.ts plugin/src/main.ts
git commit -m "✨ feat(plugin): preview server error → events.jsonl mirror"
```

---

## Task 12: ADR-0028 작성

**Files:**
- Create: `docs/decisions/0028-dogfood-automation-instrumentation.md`

- [ ] **Step 12.1: ADR 작성**

```markdown
---
date: 2026-04-27
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
  - dogfood
  - debug
  - m6
summary: AI 세션의 dogfood 자동화 위한 plugin instrumentation 도입. EventLogger (events.jsonl) + DevSnapshot API + 8개 dogfood 명령 (debugMode 게이트)
---
# ADR-0028: Dogfood 자동화 Instrumentation

- **Status**: Accepted
- **Supersedes**: -
- **Superseded by**: -

## Context

dogfood 사이클 (v0.1.31~v0.1.46) 에서 AI 세션이 사용자에게 *수동 작업* 전가하던 작업:

1. notedrop.log 첨부 (매 publish 후)
2. plugin reload (BRAT cache 우회 또는 새 main.js install 후)
3. 시나리오 재현 (cache hit/miss/fingerprint mismatch — settings 수동 편집)
4. share repo 검증 (manifest 와 baseline mismatch 시)
5. publish 결과 확인 (Notice 사라진 후 console 검증)

obsidian-cli (`obsidian eval`, `obsidian command`, `obsidian plugin:reload`) 가 이미 풀 자동화 가능 (별도 SKILL.md 갱신). 단 한계:

- `notedrop.log` 가 multiline JSON + 사람-가독 형식 → parse 불안정
- 명령 완료 신호 없음 (Notice fade out 시점만)
- settings 전체 dump 시 `githubPat` 평문 노출 (Logger 안 redactSecrets 존재하지만 외부 eval 직접 dump 는 마스킹 안 됨)
- baseline 강제 reset / fake fingerprint / cache reset 등 *위험* 작업이 production 명령 (`reset-publish-baseline`) 으로 노출됨 — debugMode 게이트 없음

## Decision

plugin 측 instrumentation 도입:

1. **EventLogger** (`services/EventLogger.ts`) — `events.jsonl` (NDJSON) 등록. trace ID (UUID v4) 발급. 1줄 1 entry 라 parse 안정. `githubPat`/`token` 자동 마스킹
2. **DevSnapshot API** (`ctx.devSnapshot()`) — internal state 전체 dump. `githubPat` 마스킹. `lastPublishedFiles` 전체 노출 회피 (count 만)
3. **dogfood command registry** (`commands/dogfood/`) — 8개 시나리오 명령. `debugMode==true` 시만 등록 (production 사용자 노출 없음):
   - `dogfood:dump-state` — devSnapshot 출력
   - `dogfood:reset-cache` — viewer cache key null
   - `dogfood:fake-fingerprint` — 잘못된 key 설정
   - `dogfood:reset-baseline` — 모든 baseline 필드 null
   - `dogfood:export-baseline` — baseline file mapping 출력
   - `dogfood:dump-log-tail` — notedrop.log tail 출력
   - `dogfood:trigger-publish-{smart,force}` — publish + trace ID
   - `dogfood:cleanup-stale-buildid` — share repo cleanup (stub, 후속 의무)
4. **preview console mirror** — preview server error → events.jsonl
5. **Logger flush** — onunload 시 pending append 보장 (reload race fix)

## Consequences

긍정:
- AI 세션 dogfood 자동화 ~80% 달성 (수동 의무 = 결과 review 만)
- production 사용자 안전 (debugMode 게이트로 위험 명령 노출 없음)
- secret 노출 감소 (마스킹 일관)
- parse 안정 (NDJSON)

부정:
- bundle 크기 증가 (~50KB 추정 — dogfood 코드 존재. debugMode 비활성 시 *실행* 안 되지만 *코드* 는 존재)
- 명령 등록 동적 분기 (debugMode 변경 시 reload 의무 — UX friction. SettingsTab 안내 추가)
- `cleanup-stale-buildid` 는 stub — 실 구현은 후속 plan (위험 ↑↑)

## Alternatives Considered

### A. 외부 도구만으로 자동화 (plugin 변경 없음)
긍정: bundle 크기 없음, plugin 코드 깔끔
부정: events.jsonl 형식 강제 불가 (notedrop.log multiline 그대로) → parse 불안정. settings 직접 변경 위험 (githubPat 노출, 잘못된 path 설정)

### B. dogfood 명령을 production 명령에 통합 (게이트 없음)
긍정: 명령 등록 분기 없음
부정: `Cmd+P` 에 위험 명령 노출 — 사용자 실수 가능

### C. dogfood 전용 plugin 분리
긍정: production main 의 코드 없음
부정: 의존 복잡 (notedrop main + dogfood plugin 같이 install 의무). dogfood 의 가치는 *내부 state 접근* 인데 별도 plugin 은 그게 어려움

## Related

- ADR-0024: arc42 + ADR 패턴 (본 ADR 도 그 패턴)
- spec §13 dogfood-ux-requirements (본 ADR 갱신)
- spec §9.7 PAT 노출 금지 (마스킹 의무)
- 외부: `.claude/skills/notedrop-dogfood-automation/SKILL.md` (AI 세션 사용 가이드)
```

- [ ] **Step 12.2: commit**

```bash
git add docs/decisions/0028-dogfood-automation-instrumentation.md
git commit -m "📝 docs(adr): ADR-0028 dogfood automation instrumentation"
```

---

## Task 13: spec arc42 §13 갱신 + SKILL.md 갱신 + version bump release

**Files:**
- Modify: `docs/13-dogfood-ux-requirements.md` (또는 §14 추가)
- Modify: `.claude/skills/notedrop-dogfood-automation/SKILL.md`
- Modify: `manifest.json`, `plugin/manifest.json`, `versions.json`

- [ ] **Step 13.1: spec §13 갱신**

기존 file 의 *Dogfood automation* 섹션 등록 (또는 새 §14):

```markdown
## §13.7 (또는 §14) Dogfood automation instrumentation

debugMode==true 시 plugin 이 다음 등록:

- `events.jsonl` (NDJSON) — `<vault>/.obsidian/plugins/notedrop/events.jsonl`. 1줄 1 JSON, AI 세션 polling 안정
- 8개 `notedrop:dogfood:*` 명령 — `Cmd+P` 등록. AI 세션이 `obsidian command id=...` 로 trigger
- `ctx.devSnapshot()` — internal state 마스킹 dump

ADR-0028 참조. SKILL: `.claude/skills/notedrop-dogfood-automation/`
```

- [ ] **Step 13.2: SKILL.md 갱신**

`.claude/skills/notedrop-dogfood-automation/SKILL.md` 에 *Capability matrix* 의 §3.4/§4.3/§5.2 row 갱신 (이제 가능 등록) + *핵심 패턴* 에 events.jsonl polling 패턴 등록:

```markdown
### N. events.jsonl polling (v0.1.47+)

```bash
# trace 기반 명령 결과 polling
TRACE_REGEX="dogfood_publish_completed.*$EXPECTED_TRACE"
# 명령 trigger
obsidian command id=notedrop:dogfood:trigger-publish-smart
# polling
for i in $(seq 1 60); do
  sleep 1
  TAIL=$(obsidian eval code="(async()=>(await app.vault.adapter.read('.obsidian/plugins/notedrop/events.jsonl')).slice(-2000))()" 2>&1 | tail -1)
  echo "$TAIL" | grep -q "dogfood_publish_completed" && break
done
```
```

- [ ] **Step 13.3: version bump v0.1.47**

```bash
# manifest.json (repo root) 와 plugin/manifest.json 의 "version": "0.1.47"
# versions.json 에 "0.1.47": "1.4.0" 등록
```

- [ ] **Step 13.4: 빌드 + 통합 검증**

```bash
cd plugin && npm run build
cd .. && cd plugin && npx vitest run
```

Expected: PASS (모든 테스트 + 새 EventLogger/DevSnapshot 테스트)

- [ ] **Step 13.5: commit + tag + push**

```bash
git add manifest.json plugin/manifest.json versions.json docs/ .claude/skills/
git commit -m "$(cat <<'EOF'
🔖 release(plugin): v0.1.47 — dogfood automation instrumentation

EventLogger + DevSnapshot + 8 dogfood commands (debugMode 게이트).
ADR-0028 + spec §13 갱신 + SKILL.md 갱신.
EOF
)"
git tag 0.1.47
git push origin main 0.1.47
```

GitHub Actions release.yml 가 main.js + manifest.json + styles.css upload.

---

## Self-Review

**Spec coverage:**
- ✅ §3.1 log read — events.jsonl 기록 + dump-log-tail 명령
- ✅ §3.2 settings edit — dogfood 명령들로 안전 분리
- ✅ §3.3 명령 trigger + wall clock — trigger-publish-with-trace + events.jsonl durationMs
- ✅ §4.3 onload signal — Logger flush + lifecycle_onload event
- ✅ §5.2 cleanup stub — 후속 plan
- ⚠️ §3.4 viewer screenshot — plugin 변경 무관 (playwright-skill 대안 SKILL.md 안)
- ⚠️ §6.3 mock vault — plugin 변경 무관

**Placeholder scan:** 없음 (모든 step 코드 등록). Task 9 의 cleanup-stale-buildid 는 *명시적 stub* 으로 등록 — 후속 plan 의무.

**Type consistency:**
- `EventLogger.emit(type, data?, traceId?)` 일관 (Task 1, 5-9)
- `ctx.devSnapshot(): Promise<DevSnapshot>` 일관 (Task 2, 3, 5)
- `CommandDef = {id, name, callback}` 기존 패턴 따름 (Task 5-9)

**위험 평가:**
- bundle 크기: 추정 +50KB (실측 의무 — Task 13 빌드 후 main.js size diff 등록)
- debugMode 변경 후 reload 안 함 시 명령 visibility mismatch — SettingsTab 안내 추가 (Task 10)
- cleanup-stale-buildid 미구현 — stub Notice 명시

---

## Execution Handoff

Plan 작성 — `docs/superpowers/plans/2026-04-27-dogfood-automation-instrumentation.md`. 두 옵션:

**1. Subagent-Driven (권장)** — task 별 fresh subagent 등록. 빠른 iteration, task 간 review

**2. Inline Execution** — 본 세션에서 task 묶음 실행. checkpoint 별 review

본 plan 13 task 중 핵심 (1-4, 10) TDD, 나머지 (5-9 명령 묶음, 11-13) 패턴 재사용 + spec/release. Task 9 (cleanup-stale-buildid) stub 으로 등록.

어느 방식?
