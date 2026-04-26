import type { CommandDef } from '../types.js'

/**
 * Dogfood 명령 — debugMode==true 시만 등록.
 *
 * 위험한 명령 (baseline reset, cache key 강제, share repo cleanup) 을
 * production 사용자에게 노출하지 않기 위함. AI 세션 (notedrop-dogfood
 * automation skill) 가 호출.
 *
 * 모든 명령은 events.jsonl 에 entry 기록 (외부 polling/parse 안정).
 *
 * 후속 task 5-9 에서 명령 등록.
 */
export const DOGFOOD_COMMAND_REGISTRY: readonly CommandDef[] = [
  // Task 5-9 에서 등록
]
