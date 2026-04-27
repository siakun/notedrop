---
date: 2026-04-27
type: 핸드오프
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - v0.1.48
  - viewer-sync
  - dogfood-automation
summary: v0.1.48 자율 세션 — obsidian-cli skill 직접 dogfood 측정 → 옵션 B 의 dirty=false 누락 발견 → ViewerSyncCheck 신규 service + 두 진입점 Notice fix → release. 사용자 부재 (아침) 자율 진행
---

# v0.1.48 자율 세션 — viewer fingerprint mismatch 누락 fix

## 1. 컨텍스트

사용자 발화: "하드코딩 안하고, 휴먼 검토가 많이 없는쪽으로 해서 진행. 나 아침 먹고올게."

본 세션이 obsidian-cli skill (`.claude/skills/notedrop-dogfood-automation/SKILL.md`) 의 *직접 측정 기능* 활용 — v0.1.47 시점 사용자 vault environment dogfood 자동화 1차 검증.

## 2. obsidian-cli 활용 측정

### 2.1 환경 검증

```
vault: obsidian-personal
plugin: notedrop v0.1.47 (debugMode=true)
events.jsonl + notedrop.log + data.json: 모두 기록 ✓
dogfood 명령어 9개 모두 등록 ✓
baseline file count: 144
lastViewerCacheKey: d4243afa5d73...||notedrop-share
```

### 2.2 baseline 의 buildId provenance

```
baseline buildId = "FJemeaPN-dqIFh8qHlJdP"
→ share repo commit cf8ab44 (v0.1.45 force publish, 2026-04-26 21:08)
→ v0.1.46 deterministic fix 적용 전 random buildId
```

baseline 에 *옛 fingerprint* 저장됨. v0.1.47 plugin 의 *deterministic
buildId='notedrop-viewer'* = `9b1df3c4...`. **mismatch**.

### 2.3 buildPlan 직접 호출 측정 (publish 부작용 없음)

| 시나리오 | planDurationMs | viewerCacheHit | cached entries | total |
|---|---|---|---|---|
| current_mismatch (v0.1.46 옵션 B 의 cached 분기) | **2 ms** | false | 141 | 144 |
| key=null (cached 분기 적용) | **1 ms** | false | 141 | 144 |
| force=true (전체 unpack) | **47 ms** | false | 0 | 144 |

**옵션 A+B 의 실제 효과 = ~45 ms 절감** (사용자 dogfood log 의 49 ms 와 일치).

## 3. 발견된 누락 — 옵션 B 의 *반쪽 적용*

v0.1.46 옵션 B 의 fingerprint mismatch Notice 가 **publish 진행 케이스만**
등록. dirty=false (노트 변경 없음) 시:

1. `publishVault` 등록 dirty 게이트 진입
2. `dirtyTracker.revalidate()` 가 false 반환 (변경 없음)
3. `new Notice('변경 사항이 없습니다')` + early return
4. **fingerprint mismatch Notice 표시 없음** — executePublish 진입 0

사용자가 plugin update 후 노트 변경 없는 상태로 publish 클릭 → 영원히
sync 의무 인지 안 함 → share repo 의 viewer 자산 stale (옛 buildId 그대로).

## 4. fix — v0.1.48

### 4.1 신규 service

**`plugin/src/services/ViewerSyncCheck.ts`**:

- `checkViewerFingerprintMismatch(settings)` — settings 만으로 mismatch 감지
  (string compare, 0 ms 비용. buildPlan 호출 X)
- `VIEWER_SYNC_NOTICE_MESSAGE`, `VIEWER_SYNC_NOTICE_TIMEOUT_MS` 상수화 — 호출
  측 일관성 의무 (하드코딩 메시지 제거)

needsSync=true 분기:
- publishViewerAssets=true
- VIEWER_FINGERPRINT 임베드 (빌드 산출물 정상)
- baseline 저장 (첫 publish 아님)
- current !== baseline (실 mismatch)

### 4.2 두 진입점 호출

**`plugin/src/main.ts` onLayoutReady 직후**:

```ts
const syncCheck = checkViewerFingerprintMismatch(this.settings)
if (syncCheck.needsSync) {
  new Notice(VIEWER_SYNC_NOTICE_MESSAGE, VIEWER_SYNC_NOTICE_TIMEOUT_MS)
  void eventLogger.emit('viewer_fingerprint_mismatch', { source: 'lifecycle_onload', ... })
}
```

**`plugin/src/commands/publishVault.ts` dirty=false early return 직전**:

```ts
if (!dirty) {
  const syncCheck = checkViewerFingerprintMismatch(settings)
  if (syncCheck.needsSync) {
    new Notice(VIEWER_SYNC_NOTICE_MESSAGE, VIEWER_SYNC_NOTICE_TIMEOUT_MS)
  } else {
    new Notice('변경 사항이 없습니다...', 5000)
  }
  return { status: 'skipped', reason: 'not_dirty' }
}
```

publish 진행 후 mismatch Notice (v0.1.46 도입분) 도 동일 const 사용 → 메시지
일관성 ✓.

### 4.3 단위 테스트 (7 신규)

`ViewerSyncCheck.test.ts`:
- publishViewerAssets=false → needsSync=false
- baseline=null (첫 publish) → needsSync=false
- match → needsSync=false
- mismatch → needsSync=true
- publicRoot 변경 → 다른 fingerprint → needsSync=true
- repoSegment 변경 → 다른 fingerprint → needsSync=true
- Notice 상수 검증

전체: plugin **268 tests** (v0.1.47 의 261 → +7) + viewer 54 tests (회귀 없음)

## 5. 부수 정정

v0.1.47 의 4 곳 version sync 누락 정정 — `plugin/package.json` +
`viewer/package.json` 의 0.1.46 잔재. v0.1.48 발행 시 모두
0.1.48 으로 sync.

## 6. release.yml 새 trigger 첫 작동 검증

본 commit (`a6e27eb`) 이 *새 release.yml manifest paths trigger* 첫 검증
사례:

- 사용자가 manual tag 작성 안 함 (이전 v0.1.47 시점 사용자가 *tag 작성 누락
  * 결함 회피)
- workflow 자동 tag + release asset 발행

run id `24971742100` background monitoring 진행.

## 7. 본 세션이 *수행하지 않은* 의무

- `dogfood:cleanup-stale-buildid` 실 구현 — share repo 에서 stale buildId
  (FJemeaPN-... 등) 자동 cleanup. Tree API sha=null 적용 새 commit 작성
  등록. 작업량 큼 (GitHubPublisher 확장 + 단위 테스트). 후속 plan
- 사용자 vault에서 *실제 sync viewer assets 실행 후 cache hit 측정* —
  share repo 의 commit 부작용. 사용자 명시 의무 (현
  세션의 *직접 코딩* 의도, 부작용 최소화)
- viewer UI 의 visual 검증 — `playwright-skill` 또는 `browser-use` 회유

## 8. 다음 세션 의무

1. **사용자가 v0.1.48 plugin BRAT update 또는 manual install** 진행
2. plugin reload 진행 (Settings → Community Plugins → notedrop OFF/ON 또는
   `obsidian plugin:reload id=notedrop`)
3. **검증**:
   - onload Notice "viewer 자산 갱신 의무" 1회 표시
   - publish 클릭 (변경 없음 상태) 시 Notice 동일 메시지 표시
   - events.jsonl 의 `viewer_fingerprint_mismatch` event 기록 검증
4. **사용자의 sync 명령어 실행** (의도된 부작용) → cache hit 검증
   가능
5. **cleanup-stale-buildid 실 구현 후속 plan** — 본 핸드오프 §7 참조

## 9. 메타데이터

- main HEAD: `a6e27eb` (or release.yml 가 추가 tag commit 작성 후)
- 4 곳 version: 모두 0.1.48 ✓
- plugin tests: 268
- viewer tests: 54
- 신규 service: ViewerSyncCheck (단일 파일 + 단일 테스트)
- 호출 진입점 2개: main.ts onLayoutReady + publishVault dirty=false
- ADR 추가 없음 (UX 변경 — §13 dogfood-ux 갱신 후속 의무)

## 10. 핵심 결정

- **하드코딩 회피**: Notice 메시지 + timeout 상수 const 정의 (`VIEWER_SYNC_NOTICE_MESSAGE`)
- **buildPlan 호출 회피**: ViewerSyncCheck 가 settings 만으로 비교 → 0 ms
  비용. onload 마다 호출 비용 없음.
- **두 진입점 일관성**: main.ts + publishVault.ts 둘 다 동일 helper + 동일
  Notice — 사용자가 어디서든 동일 메시지 수신.
- **자율 진행**: 사용자 부재 + "휴먼 검토 적게" 의무 명시 → 측정
  + fix + release 사이클 전체 수행. 사용자가 *결과 review* 만.
