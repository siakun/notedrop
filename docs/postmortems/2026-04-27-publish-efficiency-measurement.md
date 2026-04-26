---
date: 2026-04-27
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - postmortem
  - publish
  - performance
  - measurement
summary: v0.1.45 옵션 A (viewer fingerprint cache) 도입 후 사용자 dogfood 측정 결과 — 옵션 A 의 절감 효과 ~50ms (예상보다 작음). 실제 비효율 = force/첫 publish 의 GitHub Tree API 68초. 옵션 B (명령어 분리, syncViewerAssets) 의 가치 재평가 + v0.1.46 도입 결정
---

# notedrop v0.1.45 옵션 A 측정 + 옵션 B 가치 재평가

## 1. Executive Summary

[v0.1.45 핸드오프](../superpowers/handoffs/2026-04-27-publish-efficiency-completion.md)
완료 후 사용자 dogfood 1차 측정. **옵션 A 의 효과가 사전 estimate (~수백 ms ~ 1초)
보다 훨씬 작음** (~50ms). 실제 비효율 (사용자 prompt §2 의 본질적 의도) =
*force / plugin update 후 첫 publish* 의 GitHub Tree API 144 file blob 호출
**~68초**. 본 측정 결과를 바탕으로 v0.1.46 에서 *옵션 B (명령어 분리)*
도입 + *옵션 A 유지* 결정.

핵심 수치 (사용자 vault 의 `notedrop.log` 측정, 2026-04-27 21:06:50 publish):
- `planDurationMs: 49` — viewer 자산 전체 unpack + 144 file SHA-256 hash 합산
- `pushFileCount: 144` (force publish, viewerCacheHit=false)
- `durationMs: 67729` (~68초) — GitHub Tree API blob 등록 + tree + commit + ref patch

## 2. 측정 데이터

### 2.1 사용자 환경

- v0.1.45 plugin (BRAT update 후)
- Debug mode 활성
- targetRepo: siakun/notedrop-share
- publicRoot: '' (= repo root)
- publishViewerAssets: true
- baseline: 144 file 존재 (직전 publish 후)

### 2.2 측정 publish (commit cf8ab44, 21:06:50Z)

```json
publish 시작:
{
  "skipChangeDetection": true,        // ← force publish
  "indexedItemCount": 2,
  "publishViewerAssets": true,
  "hasViewerCacheKey": false           // ← v0.1.44 → v0.1.45 첫 publish, 미존재
}

plan 빌드 완료:
{
  "totalFileCount": 144,
  "planDurationMs": 49,                // ← 전체 unpack + 144 hash
  "viewerCacheHit": false,
  "viewerCacheKeyMatch": false,
  "cachedEntryCount": 0
}

GitHub Tree API 완료:
{
  "pushFileCount": 144,
  "durationMs": 67729                  // ← 실제 비효율
}
```

### 2.3 비교 데이터 (commit history)

| commit | 시간 | 변경 file | viewer 자산 변경 | plugin |
|---|---|---|---|---|
| `e648185` | 19:17 | 9 | 6 (`_next/static/VEpGGb6w8VxEFpg16F-R-/...`) | v0.1.43 |
| `2a27f84` | 19:31 | 9 | 6 (`_next/static/cJGt25ttmkchWXDR9XIRn/...`) | v0.1.43 |
| `c20b319` | 21:05 | **3** | 0 | v0.1.45 첫번째 publish |
| `cf8ab44` | 21:08 | **14** | 11 (`_next/static/FJemeaPN-dqIFh8qHlJdP/...`) | v0.1.45 force publish |

**관찰**:
- v0.1.43 의 chunk hash (`cJGt25...`) 와 v0.1.45 force publish 시점 의 chunk
  (`FJemeaP...`) 가 다름 — Next.js 또는 plugin 빌드 시점 차이로 chunk hash
  변동
- `c20b319` 의 viewer 자산 변경 0 = 변경 감지 filter 가 *modified 0* 분류한
  결과 — 옵션 A 의 cache hit *또는* 변경 감지 filter (v0.1.34+) 의 양쪽
  설명 가능. 결정적 단서 (planDurationMs) 없음 (Debug mode 비활성 구간)

## 3. 분석 — 옵션 A 의 효과 재평가

### 3.1 사전 estimate vs 실측

| 단계 | 사전 estimate (사용자 prompt §2) | 실측 (notedrop.log) | 차이 |
|---|---|---|---|
| PlanFactory 의 viewer.zip unpack + path replace | ~수십 ms | 49ms 합산 (DirtyTracker 도 포함) | 일치 |
| DirtyTracker 의 144 file SHA-256 hash | ~수백 ms | 위 49ms 안 포함 | **예상보다 5~10배 빠름** |
| GitHub Tree API 144 file blob | 일반 ~5초 / 첫·force ~70초 | force 시 67729ms (~68초) | 일치 |

**핵심 발견**: DirtyTracker 의 hash 단계가 **예상보다 매우 빠름**. 144 file
의 sha256 이 Buffer 기반 + 파일 평균 크기 작음 (`< 100KB`) 이라 ms 단위.
즉 *옵션 A 의 cache hit* 가 절감하는 *plan 빌드 시간* 은 **이론적 최대 ~50ms**.

### 3.2 옵션 A 의 실 효과

| 케이스 | v0.1.44 (옵션 A 전) | v0.1.45 cache hit | v0.1.45 cache miss | 절감 |
|---|---|---|---|---|
| plan 빌드 | ~50ms | ~5ms (cached entry hash lookup 만) | ~50ms | hit 시 **~45ms** |
| GitHub Tree API push | hit 시 ~5초 / miss 시 ~68초 | ~5초 (변경 감지 filter) | 변경 감지 filter 동일 | 둘 다 v0.1.34+ 효과, A 무관 |

**결론**: 옵션 A 가 *추가로* 절감하는 건 plan 빌드 ~45ms. 사용자 체감 X.

### 3.3 실제 비효율 = GitHub Tree API 68초

force publish 또는 plugin update 후 첫 publish 시 *144 file blob 등록* +
*tree 생성* + *commit* + *ref patch* 의 누적 ~68초. 변경 감지 filter (v0.1.34+)
가 일반 publish 의 회피책이지만:

1. **사용자 dogfood 패턴 = plugin 재빌드 → publish**
   매 plugin 재빌드 시 chunk hash 변경 → 변경 감지 filter 가 viewer 자산
   *added* 분류 → 일괄 push (~68초). 옵션 A cache 도 *fingerprint mismatch*
   라 cache miss.

2. **force publish 의 의도 = 일괄 push** — 정상 동작이지만 사용자 trigger 시
   매번 68초 소비

## 4. v0.1.46 결정 — 옵션 B 도입 + 옵션 A 유지

### 4.1 옵션 B (명령어 분리) 의 핵심 가치

신규 명령어 `Sync viewer assets`:
- **fingerprint 비교** — settings.lastViewerCacheKey === VIEWER_FINGERPRINT 면
  Notice "변경 없음" + early return (push 없음)
- **다르면 일괄 push** — 144 file (manifest + content 제외, 사용자 publish
  가 책임). ~68초.
- **baseline 의 viewer 자산 path 만 갱신** — manifest + content baseline 보존

`publishVault` (일반 publish) 의 동작 변경 0 — 옵션 B 는 *추가 명령어* 만.
사용자가 plugin update 후 명시 trigger.

`publishVault` 가 *fingerprint mismatch 감지* 시 Notice "viewer 자산 갱신
의무 — Sync viewer assets 명령 실행" 띄움 (회유, 사용자 인지).

### 4.2 옵션 A 유지 사유

cache hit 시 ~45ms 절감 + cached entry 로직 자체가 *plan.files 의
자료 흐름* 명시화 효과 (DirtyTracker 가 cached kind 인식, GitHubPublisher
의 안전 가드). 폐기 시 단위 테스트 31 개 + ~100줄 코드 제거 가능하지만:

- 폐기 비용 = 단위 테스트 31 + 100줄 + cached kind type 단순화
- 유지 비용 = 0 (이미 존재함, 회귀 없음)
- 유지 가치 = ~45ms 절감 + 자료 흐름 명시

ROI 비교상 *유지* 가 합리. 단 다음 v2 release 에서 *Next.js chunk hash
deterministic 보장* 같은 본질 대안 도입 시 옵션 A 의 효과가 *큰 cache hit
빈도* 로 누적될 수 있음 — 미래 가치 보존 의도.

### 4.3 사용자 dogfood UX 변화

| 시나리오 | v0.1.45 | v0.1.46 |
|---|---|---|
| plugin update 후 publish | ~68초 ((전체) | 일반 publish ~5초 + Notice "viewer 갱신 의무" → 사용자 명시 sync ~68초 |
| 노트만 변경 publish | ~5초 (변경 감지 filter) | ~5초 (동일) |
| force publish | ~68초 ((전체) | ~68초 (동일) |
| plugin update 안 한 상태 sync 명령 | (명령어 없음) | Notice "변경 없음" + early return |

UX 명확화: 일반 publish 의 *시간 변동성* 이 사라짐 (~5초 일정). 사용자가
68초 비용 발생 시점을 *명시* 적으로 인식.

## 5. 검증 의무 (v0.1.46 release 후)

다음 publish 패턴으로 옵션 A + 옵션 B 효과 검증:

1. **v0.1.46 plugin 으로 첫 publish (cache miss)**:
   - Debug mode 활성
   - lastViewerCacheKey null 상태 (v0.1.45 → v0.1.46 update)
   - 일반 publish → fingerprint mismatch Notice 떠야 + ~5초 미만 push (manifest+content)
   - log 의 planDurationMs 측정 — cache miss 라 ~50ms 예상

2. **Sync viewer assets 명령어 실행**:
   - ~68초 push + lastViewerCacheKey 갱신
   - log 의 push file 수 = ~140 (viewer 자산만)

3. **두 번째 publish (cache hit)**:
   - 일반 publish → ~5초 미만 + viewerCacheHit=true + planDurationMs ~5ms

4. **Sync viewer assets 재실행 (변경 없음)**:
   - Notice "변경 없음" + early return + push 0

위 측정값이 본 postmortem 의 4.1~4.3 가설 확정 또는 정정. 결과는 후속
postmortem 또는 핸드오프 기록.

## 6. Lessons Learned

### 6.1 Estimate 대신 측정 우선

사용자 prompt §2 의 estimate (~수백 ms ~ 1초) 가 *DirtyTracker hash 단계*
에서 5~10배 과대. 이로 인해 옵션 A 의 ROI 계산 부정확. 다음 옵션 평가
시 *측정 patch 우선 도입* (옵션 A 의 진단 patch 같은) → 측정값 → 본격 구현
순서 권장.

### 6.2 cache 의 fingerprint deterministic 의무

옵션 A 의 fingerprint = viewer.zip 의 sha256. zip 이 viewer/out/ 의 next
build 결과 + zipSync. **next build 의 chunk hash 가 deterministic 안 함**
(매 빌드마다 다른 chunk hash). 즉 plugin 재빌드마다 cache miss. 핸드오프
§6.3 의 우려가 *현실화*.

대안 후보 (v2):
- `viewer/next.config.mjs` 의 webpack `optimization.moduleIds: 'deterministic'`
- 또는 Next.js 의 `experimental.deterministicChunkIds` (가능한지 검증)
- 또는 chunk hash 자체가 아니라 *unpacked file content* 의 hash 합산을
  fingerprint 로 사용 (chunk 이름 무관, 실 content 만)

본 postmortem 시점에 대안 적용 안 함 — 옵션 B 로 명시 trigger 분리하면
fingerprint 변동 영향 작음.

### 6.3 변경 감지 filter (v0.1.34+) 가 이미 큰 효과

옵션 A 의 도입 의도 = "일반 publish 의 viewer 자산 push 회피". 단 *변경
감지 filter (v0.1.34+) 가 이미 그 효과* 가짐 — viewer 자산 hash 가 baseline
과 동일이면 변경 없음 분류 → push 없음. 옵션 A 의 *추가* 절감 = plan 빌드
~45ms 만.

즉 옵션 A 의 *실제 가치* = "사용자가 *plan 빌드 시점 시간* 을 비효율로
인식" 한 경우만. 사용자 prompt §2 의 *본질적 의도* 는 *push 시점 68초* 였을
가능성 — 옵션 B 가 그것의 정확한 회유.

### 6.4 명령어 분리 = UX 명확화

옵션 B 의 핵심 가치는 *시간 분리* — 일반 publish 의 ~5초 vs sync 의 ~68초.
사용자가 *언제 68초 비용* 발생하는지 명시 인지. dogfood 패턴에서 사용자
mental model 과 일치 (plugin update 후 의도된 sync, 노트 변경 후 빠른
publish).

## 7. Reference

- v0.1.45 commit: `774e16b` (옵션 A 도입)
- 측정 publish commit: `cf8ab44` (force publish, 144 file, 68초)
- 비교 commit: `c20b319` (3 file, viewer 변경 없음)
- 핸드오프: [2026-04-27-publish-efficiency-completion.md](../superpowers/handoffs/2026-04-27-publish-efficiency-completion.md)
- 관련 ADR: 0027 (GitHub Tree API publish)
- 관련 spec: §13.3 dogfood-ux-requirements (v0.1.46 갱신 의무)
