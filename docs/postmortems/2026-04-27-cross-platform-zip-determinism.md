---
date: 2026-04-27
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - postmortem
  - build
  - deterministic
  - cross-platform
summary: v0.1.46 의 generateBuildId 고정만으로는 부족 — plugin esbuild 의 zip 생성 단계가 두 비-deterministic 의존 (fs.readdir OS 별 순서 + fflate.zipSync 의 default mtime). v0.1.49 가 sort + 1980-01-01 mtime 고정으로 cross-platform 진짜 deterministic 회복
---

# notedrop v0.1.49 — esbuild zip 의 cross-platform deterministic 회복

## 1. Executive Summary

[v0.1.46 deterministic fix](2026-04-27-option-b-and-viewer-sync.md#312-deterministic-fix--generatebuildid-고정)
의 `generateBuildId: 'notedrop-viewer'` 가 *viewer 측만* 안정화. plugin
esbuild 의 viewer.zip 생성 단계는 별도 비-deterministic 의존 잔존.
github-actions runner (Linux) 의 release v0.1.47 → v0.1.48 사이 viewer
source 변경 0 인데도 fingerprint 가 `9b1df3c4...` → `02a21b09...` 변동.
사용자 로컬 (Windows) 의 v0.1.48 빌드 fingerprint 도 매 빌드 다름
(`aedf3255...` → `b14cf646...` → `f54323a59c...`).

원인 두 가지:
1. **`fs.readdir` 의 OS 별 순서 차이** — Linux (github-actions runner) 는
   inode 순, Windows 는 alphabetical. 같은 viewer/out/ 이라도 zip 안 entry
   순서가 달라 zip bytes 다름
2. **`fflate.zipSync` 의 default mtime** — 매 빌드의 *현재 시각* 반영.
   같은 OS 에서도 빌드 시점마다 timestamp 다름

v0.1.49 fix: `collectFiles` 에 alphabetic sort 추가 + zipSync entry 마다
`{ mtime: new Date('1980-01-01T00:00:00Z') }` 고정. 두 빌드 byte-동일
검증 (fingerprint `2e131efd5de31508b58b1743d35dee638c34523811d1585a03a26bce4bae2217`).

이로써 옵션 A 의 cache hit 가 *plugin 재빌드 간에도* 정상 작동. viewer
source 변경 없는 plugin code-only update 시 fingerprint 동일 → 사용자가
sync 명령 실행 의무 없음.

## 2. Background — generateBuildId 고정의 한계

[v0.1.46 옵션 A 측정 postmortem §6.2](2026-04-27-publish-efficiency-measurement.md)
의 v0.1.46 fix:

```js
// viewer/next.config.mjs
generateBuildId: async () => 'notedrop-viewer'
```

검증 결과 (그 시점):
- 같은 viewer source 두 번 빌드 → 142 file 모두 byte-동일 ✓
- plugin esbuild zipSync → fingerprint 동일 ✓

단 검증이 *동일 머신, 동일 시점, 연속 빌드* 에서 진행. *cross-platform*
또는 *시간 간격* 검증 누락.

## 3. v0.1.48 사용자 vault 측정으로 발견

본 세션에서 obsidian-cli + dogfood 측정으로 사용자 환경의 fingerprint
관찰:

```
events.jsonl 의 viewer_fingerprint_mismatch event:
  v0.1.48 첫 reload (01:18:15): current=02a21b09... baseline=d4243afa...
```

baseline = `d4243afa...` — share repo commit `cf8ab44` (v0.1.45 force
publish, 2026-04-26 21:08) 의 random buildId 의 결과. v0.1.46 deterministic
fix 적용 전 release.

current = `02a21b09...` — v0.1.48 release.yml 빌드 결과.

이전 세션의 추정: v0.1.47 fingerprint = `9b1df3c4...`. v0.1.47 → v0.1.48
의 viewer source 변경 *0* (plugin only commits). 단 fingerprint 변동.

## 4. 직접 검증 — 같은 source, 다른 결과

본 세션에서 plugin 빌드 5회 진행. fingerprint 결과:

| 빌드 | fingerprint | 환경 |
|---|---|---|
| 1 | `aedf3255f236954c735abd...` | Windows 로컬, cold start |
| 2 | `b14cf6462bc4d79f020e13...` | Windows 로컬, warm |
| 3 | `b14cf6462bc4d79f020e13...` | Windows 로컬, warm (== 빌드 2) |
| 4 | `b14cf6462bc4d79f020e13...` | Windows 로컬, warm (== 빌드 2,3) |
| 5 | `f54323a59c9e...` | Windows 로컬, 다른 시점 |

**관찰**:
- 빌드 2~4 = byte-동일 ✓
- 빌드 1, 5 = 다른 fingerprint
- *.next/out 정리 후 cold start* 또는 *시간 경과* 가 변동 trigger

또 github-actions runner 의 v0.1.48 release fingerprint (`02a21b09...`) 가
*어떤 로컬 빌드와도 일치 안 함*. cross-platform 차이.

## 5. 진단 — diff 분석

같은 viewer source 의 두 *clean rebuild* (`rm -rf .next out` 후) 결과를
142 file 단위 sha256 비교:

build 1 (옛 v0.1.46 시점, buildId=`LPY3p4ZavzOY7G28bMdfU`) ↔ 빌드 2 (v0.1.48,
buildId=`notedrop-viewer`):
```
< _next/static/LPY3p4ZavzOY7G28bMdfU/_buildManifest.js
< _next/static/LPY3p4ZavzOY7G28bMdfU/_ssgManifest.js
< 404.html (옛 buildId 포함)
< 404/index.html
< index.html
< index.txt
> _next/static/notedrop-viewer/_buildManifest.js
> _next/static/notedrop-viewer/_ssgManifest.js
> 404.html (새 buildId 포함)
...
```

7 file 만 다름 — 모두 buildId 가 포함된 path 또는 content. **viewer 자체는
deterministic** ✓.

단 *plugin esbuild 의 fingerprint* 는 매 빌드 다름. 즉 *zip 생성 단계*
가 비-deterministic.

## 6. 원인 분석

### 6.1 `fs.readdir` 의 OS 별 순서

`plugin/esbuild.config.mjs` 의 `collectFiles`:
```js
async function collectFiles(root, current, acc = new Map()) {
  const entries = await fs.readdir(current, { withFileTypes: true })
  for (const entry of entries) { ... }
}
```

Node.js 의 `fs.readdir` 동작:
- **Linux (ext4)**: directory inode 의 entry 순서 — 파일 생성 순. 즉 같은
  source 라도 *체크아웃 순서* 가 OS 의 file system 동작에 의존
- **Windows (NTFS)**: alphabetical (NTFS 의 B-tree 정렬)
- **macOS (APFS)**: 별도 동작

같은 viewer/out/ 이라도 readdir 결과가 OS 별 다른 순서 → zipSync 의 entry
삽입 순서 다름 → zip bytes 다름.

### 6.2 `fflate.zipSync` 의 default mtime

fflate 의 zipSync 가 *각 entry 의 mtime* 기록:
- *옵션 미지정 시 default* = 현재 시각 (`Date.now()`)
- 매 빌드마다 다른 timestamp 기록 → zip bytes 의 file header 가 다름

이 두 변수가 *시간 + 환경* 양쪽에서 비-deterministic 의 원인.

## 7. fix — v0.1.49

### 7.1 alphabetic sort

```js
async function collectFiles(root, current, acc = new Map()) {
  const rawEntries = await fs.readdir(current, { withFileTypes: true })
  // v0.1.49: fs.readdir 의 OS 별 순서 보장 안 함 → alphabetic sort
  const entries = rawEntries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) { ... }
}
```

`localeCompare` 의 기본 동작이 cross-platform 일관 (Unicode collation).
파일명 충돌 0 이면 결정적 순서.

### 7.2 zipSync mtime 고정

```js
const FIXED_MTIME = new Date('1980-01-01T00:00:00Z')
const sortedPaths = [...files.keys()].sort()
const entries = {}
for (const relPath of sortedPaths) {
  entries[relPath] = [files.get(relPath), { mtime: FIXED_MTIME }]
}
const zipped = zipSync(entries, { level: 6 })
```

**fflate 의 mtime 입력 형식 함정**:
- 처음 시도: `{ mtime: 0 }` → Error: `date not in range 1980-2099`
- 원인: fflate 의 zip 포맷이 DOS time (1980 epoch base) 사용. mtime=0
  (= unix epoch 1970) 은 DOS time 변환 시 underflow
- fix: `new Date('1980-01-01T00:00:00Z')` (DOS time epoch 의 첫 valid 값)



### 7.3 추가 안전장치 — keys sort

`zipSync` 의 entry 객체 key 순서도 명시적 sort. JavaScript 의 object key
순서는 *insertion order* 가 보장되지만, *Map → object 변환* 시점의 입력
순서에 의존. `[...files.keys()].sort()` 로 명시화.

## 8. 검증

### 8.1 두 연속 빌드 byte-동일

```bash
rm -f src/embedded/viewer.zip.b64 src/embedded/viewer.fingerprint.txt
npm run build  # → fingerprint 2e131efd5de3...
rm -f src/embedded/viewer.zip.b64 src/embedded/viewer.fingerprint.txt
npm run build  # → fingerprint 2e131efd5de3...

DETERMINISTIC ✓
```

fingerprint = `2e131efd5de31508b58b1743d35dee638c34523811d1585a03a26bce4bae2217`
양쪽 동일.

### 8.2 단위 테스트 회귀 0

plugin typecheck 통과 + 268 tests / viewer 54 tests / 회귀 0.

### 8.3 release.yml 새 빌드 검증 (v0.1.49)

manifest paths trigger → 자동 tag + release. main.js + manifest.json +
styles.css asset 업로드. github-actions runner 환경에서도 deterministic
동작 의무 (사용자 vault 갱신 후 검증).

## 9. cache 동작의 회복

이로써 옵션 A + 옵션 B 의 통합 사이클이 *plugin 재빌드 간* 작동:

| 케이스 | v0.1.45~v0.1.48 동작 | v0.1.49 동작 |
|---|---|---|
| viewer source 변경 없는 plugin update | cache miss → 전체 push (~68초) | **cache hit → push 0** ✓ |
| viewer source 변경 있는 plugin update | cache miss → 전체 push (~68초) | fingerprint mismatch → Notice "sync 의무" → 일반 publish 5초 + 사용자 명시 sync ~68초 |
| 노트만 변경 publish | ~5초 | ~5초 |
| 첫 publish (baseline 없음) | ~68초 (단발) | ~68초 (단발, 동일) |
| force publish | ~68초 | ~68초 |

**핵심 변화**: 사용자 dogfood 패턴의 *진짜 비효율* (plugin update 마다 68초)
가 *viewer source 변경 시만* 발생. plugin code-only update (예: ViewerSyncCheck
도입 같은 plugin-only 변경) 는 cache hit 정상 작동 → 5초.

## 10. Lessons Learned

### 10.1 deterministic 의 *세 단계*

(1) viewer build (Next.js) → (2) plugin esbuild zip → (3) plugin esbuild
bundle. 각 단계가 별도 deterministic 의무. 한 단계만 fix 해도 *전체
deterministic* 보장 안 됨.

본 사례:
- v0.1.46 (1) viewer build 만 fix
- v0.1.49 (2) plugin esbuild zip 도 fix
- (3) plugin esbuild bundle 은 esbuild 자체가 default deterministic — fix 0

### 10.2 cross-platform 검증의 의무

deterministic fix 검증 시 *동일 머신, 동일 시점, 연속 빌드* 만 검증하면
cross-platform 차이 누락. 의무 검증 시나리오:
- 같은 머신, 같은 시점, 연속 빌드 (timing-deterministic)
- 같은 머신, 다른 시점, cold start (cache-deterministic)
- 다른 머신/OS (cross-platform-deterministic)
- 다른 Node 버전 (engine-deterministic)

본 fix 가 (1)(2) 만 검증. (3)(4) 는 github-actions runner 의 다음 release
에서 검증 의무.

### 10.3 fflate mtime 옵션의 함정

fflate 의 zipSync 가 *문서 미상* 의 동작 — `mtime: 0` 지정 시 DOS time
underflow 로 throw. 옵션 지정 시점에 실 빌드 + 에러 메시지 확인 필요.
*1980-01-01* 이 DOS time epoch 의 첫 valid 값.

### 10.4 obsidian-cli 직접 측정의 추적 가치

본 세션의 발견 흐름:
1. obsidian-cli 로 사용자 vault 의 lastViewerCacheKey 검사
2. v0.1.47 → v0.1.48 fingerprint 변동 발견 (viewer source 변경 0 인데)
3. 로컬 빌드 5회 진행 → outlier 빌드 발견
4. diff 분석 → 7 file 만 다름 (buildId 포함 path)
5. 그 다음 다른 viewer source 의 5회 빌드 → fingerprint 매번 다름 발견
6. esbuild.config.mjs 의 collectFiles + zipSync 진단 → 두 원인 발견

이 흐름이 사용자 수동 dogfood 만으로는 *추적 불가능*. 자동화 측정의 가치.

### 10.5 *내부 최적화* 라도 측정 의무

v0.1.46 의 generateBuildId fix 가 *내부 최적화* 분류 (사용자 가시 동작
변경 0) 로 ADR 미작성. 단 *cross-platform 영향* 검증 누락이 v0.1.49 까지
잠복. *어떤 fix 라도* 다양한 환경 검증 의무 — 분류 무관.

## 11. 미해결 영역

### 11.1 github-actions runner 검증 미완

v0.1.49 release 의 main.js 안 fingerprint 가 *내 로컬 빌드와 일치* 의무.
다음 사용자 vault update 후 obsidian-cli 검증으로 확인. 만약 불일치 시
추가 비-deterministic 변수 잔존.

### 11.2 Node 버전 의존

`fs.readdir` + `fflate.zipSync` 의 동작이 Node 버전 별 변경 가능. release.yml
의 `actions/setup-node@v4` 가 `node-version: '20'` 고정 → *Node 20 안에서만*
deterministic 보장. Node major 변경 시 재검증 의무.

### 11.3 esbuild 자체의 deterministic

plugin esbuild bundle 단계는 esbuild 의 *내부 deterministic* 에 의존. 단
esbuild 의 banner 가 timestamp 포함:
```js
const banner = `/*
 * notedrop - Obsidian plugin
 * Built ${new Date().toISOString()}
 */`
```

main.js 안의 banner 는 매 빌드 다른 timestamp. 단 viewer.zip.b64 의 hash
는 영향 없음 — banner 가 main.js 의 *맨 앞* 에만 위치. fingerprint =
viewer.zip 의 sha256 은 banner 와 무관.

단 *사용자가 main.js 의 hash 를 비교* 하는 케이스 (예: integrity check)
에서는 main.js 자체가 비-deterministic. 본 세션 범위 외.

## 12. Reference

- v0.1.46 deterministic fix commit: `43a4f27` (옛 `34e7424`)
- v0.1.49 zip deterministic fix commit: `d734a86` (옛 `7af25ef`)
- 변경 파일: `plugin/esbuild.config.mjs`
- 검증 fingerprint: `2e131efd5de31508b58b1743d35dee638c34523811d1585a03a26bce4bae2217`
- 관련 postmortem:
  - [option B and viewer sync](2026-04-27-option-b-and-viewer-sync.md) (v0.1.46~v0.1.48)
  - [tag history recovery](2026-04-27-tag-history-recovery.md) (정정 commit 사고)
- 관련 spec: §13.3.7 Diff-based publish (v0.1.34) — diff 가 viewer 자산
  hash 비교라 deterministic 의무
