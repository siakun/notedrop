---
date: 2026-04-27
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - postmortem
  - publish
  - option-b
  - viewer-sync
summary: v0.1.46 옵션 B (Sync viewer assets 명령어) 도입 + v0.1.46 deterministic fix (generateBuildId 고정) + v0.1.48 ViewerSyncCheck (옵션 B 의 dirty=false 누락 fix). publish 파이프라인의 *시간 분리* 와 *fingerprint 안정화* 가 사용자 dogfood UX 의 핵심 경계 정립
---

# notedrop v0.1.46 ~ v0.1.48 — 옵션 B 도입 + ViewerSyncCheck 누락 보강

## 1. Executive Summary

[v0.1.45 옵션 A 측정 postmortem](2026-04-27-publish-efficiency-measurement.md)
의 결론으로 *옵션 B 추가 + 옵션 A 유지* 결정. v0.1.46~v0.1.48 의 3 patch
로 publish 파이프라인의 *시간 분리* (일반 publish ~5초 / 사용자 명시 sync
~68초) 와 *fingerprint 안정화* (Next.js buildId 고정) 가 사용자 dogfood
UX 의 핵심 경계로 정립.

핵심 결정 + 발견:
- **v0.1.46 옵션 B**: 신규 명령어 `Sync viewer assets`. 일반 `publishVault`
  가 fingerprint 일치 무관 *항상* viewer 자산을 cached entry 로 plan.files
  에 등록 (cache hit 분기 항상 진입). viewer 자산 *push* 는 사용자 명시
  trigger.
- **v0.1.46 deterministic fix**: Next.js 의 `generateBuildId: () =>
  'notedrop-viewer'` 고정. random buildId 가 매 빌드 다른 path 를 생성하던
  원인 제거. 단 *cross-platform 측면* 은 v0.1.49 에서 추가 발견 ([별 postmortem](2026-04-27-cross-platform-zip-determinism.md))
- **v0.1.48 갭 발견 + fix**: 옵션 B 의 fingerprint mismatch Notice 가
  *publish 진행 케이스만* 등록. dirty=false (노트 변경 없음) 시 publishVault
  가 early return → Notice 미표시. 사용자가 plugin update 후 영원히 sync
  의무 인지 안 함. ViewerSyncCheck 신규 service 가 *settings 만으로*
  fingerprint 비교 (0 ms 비용) → main.ts onLayoutReady + publishVault
  dirty=false 두 진입점 호출.

핵심 수치:
- patch 3 (v0.1.46, v0.1.47 dogfood instrumentation, v0.1.48)
- 신규 service 2 (PlanFactory cache 분기 변경, ViewerSyncCheck)
- 신규 명령어 1 (`Sync viewer assets`)
- plugin tests: 248 (v0.1.45) → 261 (v0.1.47, dogfood instrumentation 별
  세션) → 268 (v0.1.48, +7 ViewerSyncCheck)

## 2. Background — v0.1.45 옵션 A 측정 결과

[publish-efficiency-measurement postmortem](2026-04-27-publish-efficiency-measurement.md)
의 핵심 발견 재인용:

- 옵션 A (viewer fingerprint cache) 의 *plan 빌드 시간* 절감 효과 = ~50ms
  (사전 estimate ~수백 ms ~ 1초 보다 작음)
- 실제 비효율 = force/첫 publish 의 GitHub Tree API 144 file blob 등록 ~68초
- 변경 감지 filter (v0.1.34+) 가 이미 viewer 자산 push 회피 효과 큼

사용자 결정: *시간 분리* 의 가치 (일반 publish 항상 ~5초 + 사용자가 *언제
68초 비용 발생* 명시 인지) 가 옵션 A 의 ~50ms 절감보다 우선. 옵션 B 도입.

## 3. Timeline

### 3.1 v0.1.46 옵션 B + deterministic fix (commit `6e3ea7a` + `43a4f27`)

#### 3.1.1 옵션 B — Sync viewer assets 명령어

**`commands/syncViewerAssets.ts`** 신규:
- `VIEWER_FINGERPRINT` 와 `settings.lastViewerCacheKey` 비교
- 일치면 Notice "변경 없음" + early return (push 0)
- 다르면 `collectViewerFiles()` 전체 unpack → ~144 file 일괄 push
- baseline 의 viewer 자산 path 만 갱신 (manifest + content 보존)
- `lastViewerCacheKey` 갱신 → 다음 publish 의 cache hit 활성화

**`PlanFactory.createPlanFactory` 분기 변경**:
- v0.1.45 의 cache hit 조건 = `force=false && fingerprint match && baseline
  있음` → 모두 충족 시만 cached entry
- v0.1.46 의 cache hit 분기 = `force=false && baseline 있음` → fingerprint
  match 무관 *항상* cached entry 등록
- `viewerCacheHit = (fingerprint match)` — 의미 변경: Notice 분기 신호로
  사용 (cached entry 등록 자체와 분리)

이 변경의 결과: 일반 publish 가 *항상 viewer 자산 push 안 함* (baseline
있을 때). force publish + 첫 publish (baseline 없음) 만 전체 unpack →
GitHub Tree API push.

**`publishVault.executePublish` 의 fingerprint mismatch Notice** (publish
진행 케이스):
- `pushedViewerAsset` 분기 — cached 가 아닌 viewer 자산이 plan.files 에
  있는지
- `onPublishSuccess({ updateViewerCacheKey: pushedViewerAsset })` —
  실제 viewer 자산 push 가 발생할 때만 lastViewerCacheKey 갱신
- publish 완료 후 mismatch 감지 시 Notice "viewer 자산 갱신 의무"

**`DirtyTracker.confirmPublished` 시그니처 확장**:
```ts
async confirmPublished(snapshot, options?: { updateViewerCacheKey?: boolean })
```
`options.updateViewerCacheKey === false` 시 lastViewerCacheKey 갱신 skip
— settings 가 *실제 share repo 의 viewer fingerprint* 를 가리키도록 보존.

#### 3.1.2 deterministic fix — generateBuildId 고정

**`viewer/next.config.mjs`**:
```js
generateBuildId: async () => 'notedrop-viewer'
```

Next.js 의 default generateBuildId 가 random nanoid 생성하는 동작이 매 빌드
마다 `_next/static/<buildId>/` 경로 + `index.html` / `404.html` /
`index.txt` 안의 buildId 참조를 변경 → viewer.zip 의 byte 다름. 같은
viewer source 의 두 빌드가 142 file 중 7 file 만 다름이 검증 (`_buildManifest.js`,
`_ssgManifest.js`, `index.html`, `404.html`, `404/index.html`, `index.txt`,
buildId 가 포함된 path 1개).

`'notedrop-viewer'` 고정 → 같은 viewer source 의 두 빌드 byte-동일 ✓.

단 이 fix 는 *viewer 측만* 안정화. plugin esbuild 의 zip 생성 단계는
별도 비-deterministic 의존이 잔존 ([cross-platform postmortem](2026-04-27-cross-platform-zip-determinism.md)).

### 3.2 v0.1.47 dogfood instrumentation (다른 세션)

본 세션 외 진행. v0.1.47 commit 시리즈가 plugin 에 `EventLogger` (events.jsonl
NDJSON), `DevSnapshot` (internal state 마스킹 dump), 9개 dogfood 명령어
(`dogfood:dump-state`, `dogfood:reset-cache`, `dogfood:fake-fingerprint`
등) 추가. obsidian-cli skill (`notedrop-dogfood-automation`) 이 사용하는
hook layer.

이 instrumentation 이 v0.1.48 의 *직접 측정* 을 가능하게 한 전제 조건.
ADR-0028 명문화.

### 3.3 v0.1.48 갭 발견 + ViewerSyncCheck (commit `e3a107f`)

#### 3.3.1 obsidian-cli + buildPlan 직접 호출 측정

본 세션에서 obsidian-cli 활용한 직접 측정으로 옵션 A+B 의 실효 검증:

| 시나리오 | planDurationMs | viewerCacheHit | cached entries |
|---|---|---|---|
| current_mismatch (옵션 B cached 분기) | **2 ms** | false | 141 |
| key=null + baseline 144 (cached 분기) | **1 ms** | false | 141 |
| force=true (전체 unpack) | **47 ms** | false | 0 |

옵션 A+B 의 실제 효과 = ~45 ms 절감 (이전 사용자 dogfood log 의 49 ms 와
일치 ✓).

#### 3.3.2 누락 발견 — 옵션 B 의 *반쪽 적용*

옵션 B 의 fingerprint mismatch Notice 가 *publish 진행 케이스만* 등록.
dirty=false (노트 변경 없음) 시:

1. `publishVault` 에서 dirty 게이트 진입
2. `dirtyTracker.revalidate()` 가 false 반환
3. `new Notice('변경 사항이 없습니다')` + early return
4. fingerprint mismatch Notice 미등록 (executePublish 진입 0)

사용자가 plugin update 후 노트 변경 없는 상태로 publish 클릭 → 영원히
sync 의무 인지 안 함 → share repo 의 viewer 자산 stale.

#### 3.3.3 fix — ViewerSyncCheck 신규 service

**`plugin/src/services/ViewerSyncCheck.ts`**:
- `checkViewerFingerprintMismatch(settings)` — settings 만으로 mismatch
  감지 (string compare, 0 ms 비용. buildPlan 호출 X)
- `VIEWER_SYNC_NOTICE_MESSAGE`, `VIEWER_SYNC_NOTICE_TIMEOUT_MS` 상수화 —
  호출 측 일관성 (하드코딩 메시지 제거)

`needsSync=true` 분기:
- `publishViewerAssets=true`
- `VIEWER_FINGERPRINT` 임베드 (빌드 산출물 정상)
- `baseline` 저장 (첫 publish 아님)
- `current !== baseline` (실 mismatch)

**두 진입점 호출**:

`main.ts` onLayoutReady 직후:
```ts
const syncCheck = checkViewerFingerprintMismatch(this.settings)
if (syncCheck.needsSync) {
  new Notice(VIEWER_SYNC_NOTICE_MESSAGE, VIEWER_SYNC_NOTICE_TIMEOUT_MS)
  void eventLogger.emit('viewer_fingerprint_mismatch', {
    source: 'lifecycle_onload', ...
  })
}
```

`publishVault.publishVault` dirty=false early return *전*:
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

publish 진행 후 mismatch Notice (v0.1.46 도입분) 도 동일 const 사용 →
메시지 일관성.

#### 3.3.4 사용자 vault 검증 (obsidian-cli)

v0.1.48 install 후 plugin reload 3회 + dogfood:trigger-publish-smart 1회
실행 결과:

| 시점 | events.jsonl event 또는 log entry |
|---|---|
| reload 1 (01:18:33) | `viewer_fingerprint_mismatch` event + `viewer fingerprint mismatch on load` log |
| reload 2 (01:18:55) | 동일 |
| reload 3 (사용자 발화 직전) | 동일 |
| 01:22:32 trigger-publish-smart (dirty=false) | `dirty=false but viewer fingerprint mismatch; sync required` log |

두 진입점 모두 정상 작동 ✓. 옵션 B 의 *반쪽 적용* 갭 완전 해결.

## 4. 주요 기술 결정

### 4.1 PlanFactory cache 분기의 의미 확장 (v0.1.46)

v0.1.45 의 `viewerCacheHit` = "fingerprint 일치하면 cached entry 등록".
v0.1.46 의 의미:
- `cached entry 등록` 자체는 *baseline 있음 + force=false* 일 때 항상
- `viewerCacheHit = fingerprint match` — *Notice 분기용 신호* 로 격하

이 분리가 옵션 B 의 핵심: *push 결정* 과 *fingerprint 일치 신호* 가 다른
의미. push 는 *사용자 명시 sync 명령어* 만, fingerprint 일치는 *cache hit
시간 절감 + Notice 분기*.

### 4.2 ViewerSyncCheck 의 buildPlan 회피

settings 만으로 fingerprint 비교 (string compare) → 0 ms 비용. buildPlan
호출 시 viewer.zip unpack + 144 file path replace = ~수십 ms. onload 마다
호출하면 plugin 시작 시간 지연. settings.lastViewerCacheKey + VIEWER_FINGERPRINT
+ deriveRepoSegment(targetRepo) 만으로 동일 결과 도출.

### 4.3 lastViewerCacheKey 갱신 분기 (v0.1.46)

- *실제 viewer 자산 push 발생 시* 만 lastViewerCacheKey 갱신
- 일반 publish (cached entry 만 등록, push 0) 는 *옛 fingerprint 보존*
- syncViewerAssets 또는 force publish (전체 push) 만 갱신

이 분리로 settings 의 lastViewerCacheKey 가 *실제 share repo 의 viewer
fingerprint* 를 정확히 가리킴. fingerprint mismatch 검출이 정확해짐.

### 4.4 메시지 상수화 (v0.1.48)

`VIEWER_SYNC_NOTICE_MESSAGE` const 정의. 4개 진입점에서 동일 메시지 사용:
- main.ts onLayoutReady
- publishVault dirty=false early return
- publishVault publish 완료 후 mismatch
- (잠재적 미래 진입점)

하드코딩 메시지 제거 → 일관성 + 변경 한 곳.

## 5. spec 갱신

§13.3 dogfood-ux-requirements 에 추가:
- §13.3.11 Sync viewer assets 명령 (v0.1.46)
- §13.3.12 일반 publish 의 fingerprint mismatch Notice (v0.1.46)
- §13.3.13 (작성 후속) onLayoutReady fingerprint mismatch Notice (v0.1.48)

ADR 추가 0 — *내부 UX 변경* 으로 spec macro 결정 외.

## 6. Lessons Learned

### 6.1 옵션 B 의 *시간 분리* 가치

사용자 dogfood UX 측면에서 *일반 publish 시간이 일정 (~5초)* 인 가치가
*~50ms 절감* 보다 큼. 사용자가 *언제 68초 비용 발생* 명시 인지 가능 →
mental model 과 일치.

### 6.2 *반쪽 적용* 의 위험

v0.1.46 옵션 B 가 *publish 진행 시점* 만 Notice. dirty 게이트 통과 안
하는 케이스 (사용자 노트 변경 없음 + plugin update 만) 누락. 새 기능
도입 시 *모든 진입점* 검토 의무.

본 세션에서 obsidian-cli 직접 측정으로 발견. 사용자 수동 dogfood 만으로
는 *영원히 인지 안 함* 케이스 — 자동화 측정의 가치.

### 6.3 obsidian-cli + dogfood instrumentation 의 즉각 가치

v0.1.47 의 EventLogger + dogfood 명령어 + obsidian-cli 가 본 세션에서
즉시 활용. 사용자 수동 publish + log 첨부 사이클 없이 *직접 측정 → 갭
발견 → fix → 검증* 1회 사이클 closed loop. 이전 v0.1.45 측정 사이클
대비 ~10배 빠름.

### 6.4 buildPlan 호출 비용의 미세 영향

buildPlan 호출 = viewer.zip unpack + 144 file path replace = ~수십 ms.
onload 마다 호출하면 사용자 plugin 시작 시간 누적. 본 세션의 ViewerSyncCheck
가 settings 만으로 비교 (0 ms) 함으로써 회피. 새 service 도입 시 *호출
비용* 검토 의무.

### 6.5 메시지 const 일관성

v0.1.46 에서 publishVault 의 mismatch Notice 메시지가 inline string ("notedrop:
viewer 자산 갱신 필요 - "Sync viewer assets" 명령을 실행하세요") 로 등록.
v0.1.48 에서 ViewerSyncCheck 의 const 가 다른 메시지 ("viewer 자산 갱신
의무 — Cmd+P 의 \"Sync viewer assets\" 명령어 실행"). 두 진입점이 다른
표현 → 일관성 누락. v0.1.48 fix 가 const 통일.

미래의 같은 문제 회피: *Notice 메시지 inline 금지, const 의무*.

## 7. 미해결 영역 (v0.1.48 시점)

### 7.1 cross-platform deterministic 의 미해결 (v0.1.49 fix)

generateBuildId 고정만으로는 *plugin esbuild 의 zip 생성 단계* 가 비-deterministic.
github-actions runner (Linux) 의 v0.1.47 release 와 사용자 로컬 빌드의
fingerprint 가 일치하지 않음. 별도 postmortem [cross-platform-zip-determinism](2026-04-27-cross-platform-zip-determinism.md)
참조.

### 7.2 사용자 vault 의 진짜 sync 미실행

본 세션에서 사용자가 `Sync viewer assets` 명령 실행 안 함 (share repo
commit 부작용 회피). 따라서 *진짜 cache hit* (fingerprint match 후 publish)
검증 0. 다음 세션의 사용자 의무.

### 7.3 cleanup-stale-buildid 미구현

v0.1.47 의 `dogfood:cleanup-stale-buildid` stub. share repo 의 stale
buildId (FJemeaPN-... 등) 자동 cleanup 미구현. Tree API 확장 필요.

## 8. Reference

- v0.1.46 옵션 B commit: `6e3ea7a` (정정 후 SHA, 옛 SHA `13fb7c5`)
- v0.1.46 deterministic fix commit: `43a4f27` (옛 `34e7424`)
- v0.1.47 release commit: `6b717d5` (다른 세션)
- v0.1.48 ViewerSyncCheck commit: `e3a107f` (옛 `a6e27eb`)
- 신규 파일:
  - `plugin/src/commands/syncViewerAssets.ts` (+ test)
  - `plugin/src/services/ViewerSyncCheck.ts` (+ test)
- 변경 파일:
  - `plugin/src/services/PlanFactory.ts` (cache 분기 의미 변경)
  - `plugin/src/services/DirtyTracker.ts` (`confirmPublished` options 확장)
  - `plugin/src/commands/publishVault.ts` (pushedViewerAsset + Notice)
  - `plugin/src/commands/registry.ts` (syncViewerAssetsCommand 등록)
  - `plugin/src/main.ts` (onLayoutReady fingerprint check)
  - `viewer/next.config.mjs` (generateBuildId 고정)
- 관련 spec:
  - §13.3.11 Sync viewer assets 명령
  - §13.3.12 일반 publish fingerprint mismatch Notice
- 관련 ADR:
  - 0028 dogfood automation instrumentation (v0.1.47)
- 관련 핸드오프:
  - `2026-04-27-publish-efficiency-completion.md` (v0.1.45 → v0.1.46 진입)
  - `2026-04-27-v0148-viewer-sync-gap-fix.md` (v0.1.48 자율 세션)
- 후속 postmortem:
  - [cross-platform zip determinism](2026-04-27-cross-platform-zip-determinism.md) (v0.1.49)
  - [tag history recovery](2026-04-27-tag-history-recovery.md) (정정 commit 사고)
