---
date: 2026-04-27
type: 핸드오프
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - publish-efficiency
  - completion
  - handoff
summary: v0.1.45 옵션 A (viewer fingerprint cache + 단계별 진단) 구현 + 단위 테스트 완료. push/tag 사용자 승인 미실행. 다음 세션은 측정 결과 보고 옵션 B 결정 후보
---

# Notedrop publish 비효율 개선 — v0.1.45 핸드오프

새 세션 첫 입력으로 전체 붙여넣기. 본 핸드오프 + 자동 로드 메모리만으로
다음 세션이 즉시 컨텍스트 회복.

## 0. 한눈에

| 항목 | 상태 |
|---|---|
| 옵션 A (viewer fingerprint cache) 구현 | **완료** (commit `774e16b`) |
| 단계별 durationMs 진단 | **완료** (publishVault.executePublish) |
| 4 곳 version 0.1.44 → 0.1.45 갱신 | **완료** |
| plugin typecheck + 242 tests | **통과** |
| viewer typecheck + 54 tests | **통과** (회귀 없음) |
| commit `774e16b` (v0.1.45 perf) | **완료 + push + tag 0.1.45** |
| commit `c6f63f3` (handoff 본 파일) | **완료 + push** |
| commit `05c3f5c` (deploy.yml 삭제) | **완료 + push** (사용자 승인) |
| Release.yml run for tag 0.1.45 | **성공** (사용자 확인) |
| Deploy.yml | **삭제됨** — 본 repo 의 GH Pages 데모는 *옵시디언 환경의 publish 파이프라인과 본질적으로 다름* (사용자 결정 2026-04-27). share repo 의 Pages 활성화는 사용자 자율 |
| BRAT 사용자 update + dogfood | **미실행** (사용자 단계) |
| 옵션 B (명령어 분리) | **미결정** (옵션 A 측정 후 사용자 결정) |

본 세션 main HEAD = `05c3f5c`. origin/main 와 동기 (모두 push 완료).

세션 commit 흐름:
- `774e16b` ⚡ perf(publish): v0.1.45 viewer fingerprint cache + 단계별 진단 (옵션 A) — tag `0.1.45` 발행, release.yml 통과
- `c6f63f3` 📝 docs(handoff): 본 핸드오프
- `05c3f5c` 🔧 chore(ci): deploy.yml 삭제 — 본 repo GH Pages 데모 불필요 (사용자 결정)

## 1. 본 세션 산출물 목록

### 신규 파일

- `plugin/src/services/PlanFactory.test.ts` (20 tests) — 순수 함수 + cache 분기
- `plugin/src/services/DirtyTracker.test.ts` (10 tests) — cached kind + 회귀
- `plugin/src/embedded/viewer.fingerprint.txt` (gitignored, 빌드마다 갱신)

### 수정 파일

- `plugin/esbuild.config.mjs` — embedViewerAssets() 가 viewer.zip 의 sha256
  계산 + viewer.fingerprint.txt 작성
- `plugin/src/domain/PublishOrchestrator.ts` — PublishedFile 유니언에
  `cached` kind + PublishPlan 에 viewerCacheKey/Hit 필드
- `plugin/src/settings/PluginSettings.ts` — lastViewerCacheKey 필드 추가
- `plugin/src/services/PlanFactory.ts` — fingerprint 받아 cache key 빌드 +
  force flag + cache hit 시 baseline 의 viewer 자산을 cached entry 로 등록.
  isViewerAssetPath, buildViewerCacheKey 외부 export
- `plugin/src/services/DirtyTracker.ts` — computeSnapshot/Digest/Diff 가
  ComputeOptions { force?: boolean } 받음. cached kind 의 hash 재계산 skip.
  PlanSnapshot 에 viewerCacheKey 필드. confirmPublished 가
  lastViewerCacheKey 영속화
- `plugin/src/commands/publishVault.ts` — buildPlan({ force }) + computeDiff
  과 onPublishSuccess 도 force 전파. 변경 감지 filter 의 isAlwaysPush 가
  cached 제외. plan 빌드 / diff 단계의 durationMs 진단 추가. cached entry
  가 push 대상에 도달 시 명시 차단 (Notice + early return)
- `plugin/src/commands/resetPublishBaseline.ts` — lastViewerCacheKey 도 reset
- `plugin/src/infrastructure/GitHubPublisher.ts` — createBlob 의 cached
  kind throw (안전망)
- `plugin/src/infrastructure/GitHubPublisher.test.ts` — cached entry throw 테스트
- `plugin/vitest.config.ts` — embedded text loader plugin (PlanFactory.test 가
  viewer.zip.b64 / viewer.fingerprint.txt 를 default text 로 import 가능)
- `plugin/src/main.ts` — PLUGIN_VERSION '0.1.45'
- `manifest.json`, `plugin/package.json`, `viewer/package.json` — version 0.1.45

## 2. 옵션 A 의 동작 요약

### Cache hit 흐름 (일반 publish, plugin update 없음)

1. PlanFactory(force=false) → fingerprint+publicRoot+repoSegment 가
   settings.lastViewerCacheKey 와 동일 + lastPublishedFiles 있음 → cache hit
2. baseline 의 viewer 자산 path (manifest/content 가 아닌) 만 cached
   PublishedFile entry 로 plan.files 에 등록. viewer.zip unpack 자체 skip.
3. DirtyTracker.computeSnapshot 가 cached entry 만나면 file.hash 재계산 skip
   (baseline 의 hash 그대로). text 는 baseline 에서 lookup.
4. publishVault 의 변경 감지 filter 가 cached entry 자동 변경 없음 분류 →
   filter out. 만약 isAlwaysPush 가 cached 도 강제 push 시도 → cached 제외 가드.
5. plan.files 가 manifest + content 만 → push (vanilla 시절 패턴 회복)
6. confirmPublished 가 lastViewerCacheKey + lastPublishedFiles 저장 (변경 없음)

**예상 절감**: viewer 자산 unpack/path-replace ~수십~수백 ms + DirtyTracker 의
144 file SHA-256 hash 수백 ms = 일반 publish 의 plan 단계 ~수백 ms ~ 1초.

### Cache miss 흐름 (첫 publish, plugin update 후 첫 publish, baseline reset 후)

1. PlanFactory → fingerprint 다름 또는 lastViewerCacheKey null 또는 baseline 없음 → cache miss
2. collectViewerFiles() 가 viewer.zip 전체 unpack + path replace → plan.files 전체 (옛 동작)
3. DirtyTracker.computeSnapshot 가 모든 path SHA-256 hash (옛 동작)
4. publishVault 가 변경 감지 filter 적용 (baseline 있으면) 또는 일괄 push (없으면)
5. confirmPublished 가 새 viewerCacheKey 저장 → 다음 publish 부터 cache hit

### Force publish 흐름

1. PlanFactory(force=true) → cache 무시 → cache miss 동작
2. publishVault 의 skipChangeDetection=true → 변경 감지 안 함 → plan.files 일괄 push
3. confirmPublished 가 force=true 로 computeSnapshot 호출 → 전체 hash → baseline 새로 기록

## 3. 진단 patch 의 결과

`<vault>/.obsidian/plugins/notedrop/notedrop.log` (Debug mode 활성 시) 의 다음
data 에 단계별 측정값 기록:

- `publish 시작`: skipChangeDetection, hasViewerCacheKey 등
- `plan 빌드 완료`:
  - `planDurationMs` (신규)
  - `viewerCacheHit` (신규, true/false)
  - `viewerCacheKeyMatch` (신규)
  - `cachedEntryCount` (신규)
  - 기존 totalFileCount, manifestEntries, contentEntries 등
- `변경 감지 (added X, modified Y, removed Z, +meta)`:
  - `diffDurationMs` (신규)
  - 기존 addedPaths, modifiedPaths 등
- `GitHub Tree API 완료`: `durationMs` (기존)

다음 publish 후 사용자가 `notedrop.log` 첨부 또는 콘솔 (Debug mode 비활성)
보면 옵션 A 의 효과 직접 검증 가능. 측정 결과를 다음 세션 시작 시 보고
받으면 옵션 B (명령어 분리) 가 추가 가치 있는지 결정.

## 4. 다음 세션 범위

### Task 4.1 — release 완료 (이미 처리됨, 본 세션 2026-04-27)

`774e16b` push + tag `0.1.45` push 후 release.yml 성공. release asset 발행.

### Task 4.2 — 사용자 dogfood + 측정

1. BRAT 으로 0.1.45 update (또는 manual download — BRAT 30분 cache 우회)
2. plugin 콘솔 `notedrop loaded` (`v0.1.45` 출력되어야)
3. Debug mode 활성 → publish 1회 → 다음 publish 1회 (cache hit 검증)
4. notedrop.log 의 두 publish 의 단계별 durationMs 비교:
   - 첫 publish: cache miss (fingerprint 임베드) → plan 빌드 ~수백 ms
   - 둘째 publish: cache hit → plan 빌드 ~수십 ms
5. share repo 의 manifest.json 갱신 + viewer 자산 stable 확인

### Task 4.3 — 옵션 B 결정 (사용자 승인 후)

옵션 A 의 효과가 *publish 시점 시간* 비효율 만족이면 옵션 B 불필요.

옵션 B 가 추가 가치인 케이스:
- 사용자가 *GitHub commit history 의 노이즈* 를 비효율로 본 경우 (publish
  마다 viewer 자산 commit 이라도 표시 — 단 base_tree 보존이라 changed_files
  = 0 이지만 plan.files 에 entry 가 cached 라도 commit 자체는 만들어짐)
- plugin update 후 첫 publish 의 70초 push (cache miss (전체)를 사용자가
  명시 trigger 로 분리하고 싶은 경우

옵션 B (명령어 분리) 의 구현:
- 일반 publish = manifest + content 만 (publishViewerAssets 옵션 OFF 형태)
- 신규 `Sync viewer assets` 명령어 = viewer 자산만 push
- §13 dogfood-ux-requirements 갱신 (UX 변경이라 spec 명문화의무)

### Task 4.4 — viewer.fingerprint.txt 빌드 검증 (이미 release.yml 가 검증)

release.yml 의 plugin build 단계가 esbuild 의 embedViewerAssets() 통과 →
viewer.fingerprint.txt 정상 임베드 → main.js 안 import 정상. release.yml 성공
이 곧 fingerprint 임베드 검증 결과.

### Task 4.5 — Action monitoring 의무 (메모리 가드레일, 2026-04-27 도입)

push 후 (특히 tag push) `gh run list` + `gh run view <id> --log-failed` 로
워크플로 결과 자발적 확인 + 실패 시 원인 발췌 + 우회책 제시. 본 가드레일은
`feedback_action_monitoring_의무.md` 메모리에 존재. 다음 세션도 이 의무 적용.

## 5. 측정 결과 (Phase 1)

본 세션의 *측정 patch* (durationMs) 가 적용되어 있지만 *사용자 측정 없음*. 다음
세션 시작 시 사용자 보고 받음.

이전 세션 분석의 estimate (사용자 prompt §2):
- 1 단계 (PlanFactory unpack): ~수십 ms
- 2 단계 (DirtyTracker 144 hash): ~수백 ms
- 3 단계 (GitHub blob 회수): 일반 ~5초 / 첫·force ~70초

옵션 A 가 1+2 단계의 *cache hit 케이스* 절감.

## 6. 알려진 함정 (본 세션 학습)

### 6.1 Cache hit 의 viewer.fingerprint 의무

`plugin/src/embedded/viewer.fingerprint.txt` 가 빈 문자열 또는 누락이면
PlanFactory 의 `VIEWER_FINGERPRINT !== ''` 가드가 false → cache hit 항상
실패 → 옛 동작 (전체 unpack). 즉 **plugin 빌드 직후 viewer.fingerprint.txt
가 정상 임베드되어야 옵션 A 효과**. esbuild.config.mjs 의 `embedViewerAssets()`
가 viewer/out/ 있을 때만 fingerprint 임베드. CI 의 release.yml 이 viewer 빌드
선행 후 plugin 빌드 → fingerprint 정상 임베드. 로컬 빌드도 동일.

### 6.2 Cache miss 의 baseline reset 과 협조

사용자가 `Reset publish baseline` 명령어 실행 시 lastViewerCacheKey 도
초기화. 다음 publish 가 cache miss 전체 unpack → push → 새 baseline +
viewerCacheKey 저장 → 그 다음 publish 부터 cache hit. 정상.

### 6.3 viewer.zip.b64 byte 동일 + fingerprint 다름 (이론적)

esbuild 의 zipSync 가 deterministic 인지 fflate 0.8 의 보증 미명시. 만약
같은 viewer/out/ 에서 zipped bytes 가 timestamp 등으로 달라지면 매 빌드
fingerprint 가 달라짐 → plugin update 마다 cache miss. 큰 부담 X (옛
동작과 동일). 단 실 검증은 dogfood 시점.

### 6.4 vitest plugin 의 .b64/.txt loader 환경 의존

`plugin/vitest.config.ts` 의 embedded text loader plugin 이 *test 환경*
의 .b64/.txt import 처리. esbuild 빌드는 별도 loader (esbuild.config.mjs)
사용. 두 환경의 import 시멘틱이 동일이어야 PlanFactory 가 두 환경 모두 동작.
현재 둘 다 default text export 라 호환.

### 6.5 GitHubPublisher 의 cached kind throw 경계

publishVault 의 변경 감지 filter + cached 제외 가드 + 안전망 (Notice +
early return) 셋이 cached entry 가 GitHubPublisher 에 도달 못 하게 함.
GitHubPublisher.createBlob 의 throw 는 호출 측 버그 *방어선*. 실 실행에서는
도달 안 됨.

## 7. 다음 세션 시작 명령

> v0.1.45 push + tag 진행. 본 핸드오프 §0 의 2 commit ahead 확인 후 사용자
> 승인 받기. push origin main → tag 0.1.45 → push origin 0.1.45 → release.yml
> 자동 trigger 확인. 사용자 dogfood 후 notedrop.log 의 cache hit/miss
> durationMs 보고 → 옵션 B 결정 (필요 시 §13 dogfood-ux-requirements 갱신).

## 8. 결정 메타데이터

- main HEAD: `774e16b`
- 4 곳 version: 모두 `0.1.45` (manifest.json + plugin/package.json +
  viewer/package.json + plugin/src/main.ts.PLUGIN_VERSION)
- plugin tests: 242 (이전 211 → +31)
- viewer tests: 54 (회귀 없음)
- backup branch: `backup-vanilla-viewer` (origin)
- ADR 변경 없음 (내부 최적화, spec macro 결정 외)
