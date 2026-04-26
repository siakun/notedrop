import type { CommandDef } from '../types.js'
import { dumpStateCommand } from './dumpState.js'
import { resetCacheCommand } from './resetCache.js'
import { fakeFingerprintCommand } from './fakeFingerprint.js'
import { resetBaselineCommand } from './resetBaseline.js'
import { exportBaselineCommand } from './exportBaseline.js'
import { dumpLogTailCommand } from './dumpLogTail.js'

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
  dumpStateCommand,
  resetCacheCommand,
  fakeFingerprintCommand,
  resetBaselineCommand,
  exportBaselineCommand,
  dumpLogTailCommand
]
