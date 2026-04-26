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
summary: AI 세션의 dogfood 자동화 위한 plugin instrumentation 도입. EventLogger (events.jsonl) + DevSnapshot API + 9개 dogfood 명령 (debugMode 게이트)
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

obsidian-cli (`obsidian eval`, `obsidian command`, `obsidian plugin:reload`) 가 풀 자동화 가능 (`.claude/skills/notedrop-dogfood-automation/SKILL.md` 참조). 한계:

- `notedrop.log` 가 multiline JSON + 사람-가독 형식 → parse 불안정
- 명령 완료 신호 없음 (Notice fade out 시점만)
- settings 전체 dump 시 `githubPat` 평문 노출 (Logger 안 redactSecrets 존재하지만 외부 eval 직접 dump 는 마스킹 안 됨)
- baseline 강제 reset / fake fingerprint / cache reset 등 *위험* 작업이 production 명령 (`reset-publish-baseline`) 으로 노출됨 — debugMode 게이트 없음
- plugin reload 시 onload log 가 `fs.appendFile` race 로 손실 가능 (검증 시 발견)

## Decision

plugin 측 instrumentation 도입:

1. **EventLogger** (`services/EventLogger.ts`) — `<vault>/.obsidian/plugins/notedrop/events.jsonl` (NDJSON) 등록. trace ID (UUID v4) 발급. 1줄 1 entry 라 parse 안정. `githubPat`/`token`/`pat`/`authorization`/`auth` 자동 마스킹 (Logger.ts redactSecrets 와 정합). Windows concurrent write race 회피 위해 promise queue 직렬화 도입
2. **DevSnapshot API** (`services/DevSnapshot.ts`, `ctx.devSnapshot()`) — internal state 전체 dump. `githubPat` 마스킹. `lastPublishedFiles` 전체 노출 회피 (count 만)
3. **dogfood command registry** (`commands/dogfood/`) — 9개 시나리오 명령. `debugMode==true` 시만 등록 (production 사용자 노출 없음):
   - `dogfood:dump-state` — devSnapshot 출력
   - `dogfood:reset-cache` — viewer cache key null
   - `dogfood:fake-fingerprint` — 잘못된 key 설정
   - `dogfood:reset-baseline` — 모든 baseline 필드 null
   - `dogfood:export-baseline` — baseline file mapping 출력 (hash + hasText)
   - `dogfood:dump-log-tail` — notedrop.log tail (100줄) 출력
   - `dogfood:trigger-publish-smart` — smart publish + trace ID + durationMs
   - `dogfood:trigger-publish-force` — force publish + trace ID + durationMs
   - `dogfood:cleanup-stale-buildid` — share repo cleanup (stub, 후속 plan 의무)
4. **preview console mirror** — PreviewServer 의 console.error → events.jsonl `preview_error` event
5. **Logger flush** — onunload 시 pending fs.appendFile await 보장 (reload race fix)
6. **lifecycle_onload event** — onload 끝에 events.jsonl 기록 (notedrop.log 와 별개로)

## Consequences

긍정:
- AI 세션 dogfood 자동화 ~80% 달성 (수동 의무 = 결과 review 만)
- production 사용자 안전 (debugMode 게이트로 위험 명령 노출 없음)
- secret 노출 감소 (마스킹 일관)
- parse 안정 (NDJSON, Windows concurrent-safe)
- reload 후 onload log 손실 회피 (race fix)

부정:
- bundle 크기 증가 (~30KB 추정 — dogfood 코드 존재. debugMode 비활성 시 *실행* 안 되지만 *코드* 는 존재)
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
