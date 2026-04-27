---
date: 2026-04-27
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - postmortem
  - publish
  - bootstrap-overwrite
  - dogfood
summary: v0.1.31 ~ v0.1.40 의 dogfood 시리즈 — 사용자 publish 가 share repo root manifest 를 영구히 welcome bootstrap 으로 덮어쓰던 critical 버그 발견·진단·fix. 부수적으로 publish 명령어 캡슐화·Command 패턴·Service Layer 분리·진단 로깅 시스템 도입
---

# notedrop 0.1.31 ~ 0.1.40 — Bootstrap manifest 덮어쓰기 버그 + 진단 로깅 + 전체 리팩터링

## 1. Executive Summary

이전 postmortem ([2026-04-27-viewer-nextjs-migration.md](2026-04-27-viewer-nextjs-migration.md)) 이후 **약 2 시간 동안 v0.1.31 → v0.1.40 의 10 patch 진행**. 핵심 critical 버그 1 건 발견·fix + 사용자 시각의 코드 품질 우려 (캡슐화 부족) 에 대한 전체 리팩터링 + 진단 로깅 시스템 도입.

핵심 critical 버그: **`viewer.zip` 안의 bootstrap manifest 가 사용자 publish 의 manifest 를 영구히 덮어쓰던 GitHub Tree API last-write-wins 버그**. v0.1.0 마이그레이션 시점부터 잠복 → 사용자가 dogfood 중 *"GH Pages 가 노트 2건 publish 했음에도 welcome 만 표시"* 로 처음 발견 → v0.1.40 에서 fix.

이 버그는 **v0.1.39 의 진단 로깅 시스템 (FileLogger + Debug mode)** 도입 후 *첫 번째 사용 사례* 에서 즉시 발견됨. plan.files 의 `manifestEntries` 배열에 `["manifest.json", "manifest.json"]` 등록된 것이 결정적 단서. 진단 시스템의 가치 증명.

핵심 수치:
- patch 10 (0.1.31~0.1.40)
- critical 버그 1 + UI/동작 fix 7 + 리팩터링 2
- 신규 service 4 (Logger, PlanFactory, DirtyTracker, SeedPersistence)
- main.ts 365줄 → 134줄 (-231줄, dispatcher 만)
- plugin 단위 테스트 211 그대로 유지 (fix 시 회귀 없음)

## 2. Background — 이전 마이그레이션 직후 상태

[이전 postmortem](2026-04-27-viewer-nextjs-migration.md) 의 §6.1 미해결 영역에 *"사용자 명시 1건의 미해결 버그 — 본 보고서 시점 미명시"* placeholder 가 있었다. 사용자가 dogfood 진행 중 발견한 첫 번째 핵심 이슈가 본 시리즈 발단.

v0.1.30 시점 의 상황:
- viewer Next.js 마이그레이션 완료
- ViewSettings + 4 layout + paper-page + paged.js 폐기 + 자체 페이지네이션 작동
- GH Pages 활성화 사용자 1회 작업 (configure-pages 권한 한계)
- main.js 7.4MB (viewer 자산 zip 인라인)
- *publish 흐름은 검증 0* (사용자 첫 dogfood 가 v0.1.31 시리즈)

## 3. Timeline

### 3.1 v0.1.31 — publish 명령어·버튼 동작 일관성 fix

**증상**: 사용자가 settings 의 발행 버튼이 비활성 (수정 없음 = dirty=false) 상태에서 Cmd+P 의 `Notedrop: Publish vault to GitHub` 명령어 실행. Notice "141 파일 push" + 30초 후 commit 생성.

**원인**: dirty 추적이 *UI layer (SettingsTab 의 disabled)* 에만 존재고 진입점 (`runPublish`) 자체에 게이트 없음. 명령어가 그 게이트 우회. 사용자 표현 *"캡슐화 안 됨, 옛날 코드와 꼬임"* 정확.

**Fix**: `runPublish()` 에 `revalidateDirty()` 게이트. dirty=false 시 Notice + early return. force 옵션 추가 (의도된 강제 publish 케이스).

### 3.2 v0.1.32 — publish 명령어 캡슐화 리팩터링

**증상**: v0.1.31 의 fix 가 main.ts 안의 runPublish 에 dirty 체크 + Notice + force 플래그를 함께 추가하여 monolithic 화. 사용자 지적 *"main.ts 에 하드코딩 하지 말고 명령어 단위로 분리 캡슐화"*.

**Fix**: 
- `commands/publishVault.ts` 의 `executePublish` (private 의도) + `publishVault` (smart entry, gate 통과 시)
- `commands/forcePublishVault.ts` 신규 (gate 우회)
- main.ts 의 `runPublish` 메서드 폐기. 두 개 명령어 (publish-vault, force-publish-vault) 가 직접 commands 호출.

### 3.3 v0.1.33 — 전체 리팩터링 (Command 패턴 + Service Layer + DI Context)

**증상**: 사용자 *"전체적으로 리팩토링 검사. 디자인 패턴적으로 좋은 것을 채용"*. main.ts 가 365줄 monolithic — Plugin 라이프사이클 + Adapter wire-up + 9 addCommand + dirty 추적 메서드 + seed 영속화 + 디지스트 계산 등 너무 많은 책임.

**Fix**: 디자인 패턴 적용 4 건.

| 패턴 | 적용 |
|---|---|
| **Command Pattern** | 각 `commands/<name>.ts` 가 `<name>Command: CommandDef` 자기 등록. `commands/registry.ts` 가 array 로 모음. main.ts 가 iterate 후 addCommand. |
| **Dependency Injection (Plain Object)** | `services/PluginContext.ts` — app, vault, index, dirtyTracker, seedPersistence, logger 등 14 필드. commands/UI 가 단일 ctx 사용, plugin reference 사라짐. |
| **Service Layer** | `services/DirtyTracker.ts` (§13.4.3 dirty 추적), `services/SeedPersistence.ts` (§13.4.2 hash 영속화). main.ts 의 비즈니스 메서드 모두 이동. |
| **Hexagonal 정신 회복** | services 가 Domain·Adapter 조합, Notice (Obsidian 의존) 는 commands 안에만. main.ts 의 Obsidian Plugin import 외 0. |

main.ts 365줄 → **134줄** (-231줄).

새 명령어 추가 절차:
- 이전: `commands/foo.ts` + `main.ts` addCommand 박스 + 의존 와이어업 + dirty 게이트 (4곳 변경)
- 새: `commands/foo.ts` + `registry.ts` 1줄 (2곳, main.ts 변경 없음)

### 3.4 v0.1.34 — GH Pages 흰 페이지 + 141 파일 push 비효율 fix

**증상 두 개**:
1. https://siakun.github.io/notedrop-share/ 가 흰 페이지. 자산 link 가 `/notedrop/_next/...` 고정되어 있는데 GH Pages 호스팅 prefix 가 `/notedrop-share/` → 모든 자산 fetch 404.
2. publish 마다 viewer 자산 전체 141 파일 push. base_tree 가 변경 없는 path 자동 보존하지만 *blob 호출* 은 매번 141회. 30초.

**Fix 두 개**:

A. **basePath placeholder + publish 시 동적 replace**:
- `viewer/next.config.mjs` basePath = `/__NOTEDROP_BASE__` (prod 한정)
- `services/PlanFactory.ts` (신규) 의 `collectViewerFiles` 가 publish 시 viewer.zip 의 text 파일 안의 placeholder → 사용자 share repo 이름 string replace
- `deriveRepoSegment(targetRepo)` — user/org page 면 빈값, 일반 repo 면 repo 이름

B. **변경 감지 publish (diff 기반 plan.files 축소)**:
- `DirtyTracker.computeDiff()` 의 added + modified path 만 plan.files 에 남김
- 변경 없는 path 는 base_tree 가 보존
- force publish 는 전체 (의도된 강제)

설계 개선: **PlanFactory 가 Single Source of Truth**. publishVault, forcePublishVault, DirtyTracker 모두 같은 함수 호출. 이전엔 publishVault 가 자체 hash 계산 + DirtyTracker 가 따로 → 두 곳에서 동일 알고리즘 중복.

### 3.5 v0.1.35 — publish 진단 로그 + Notice 메시지 명확화

**증상**: 사용자가 *"변경 보기 modal = 1 changed file / Notice = 142 파일 push"* mismatch 보고. 두 publish 시점이 다름이지만 사용자 멘탈 모델로는 동일 시점에 두 정보 충돌.

**Fix**: console.log 추가 + Notice 메시지에 사유 명시:
- `X 파일 push 중 — 첫 publish (baseline 없음)` / `baseline mismatch` / `force publish` / `변경 감지 (added A, modified M, removed R)`
- baseline mismatch 자동 감지: 모든 path 가 changed 분류 + totalFileCount > 10 시 console.warn

### 3.6 v0.1.36 — manifest 항상 push + baseline reset 명령어

**증상**: 사용자 publish 후 GH Pages 가 사용자 노트 2건 publish 됐음에도 welcome 만 표시. share repo commit 의 file_paths 에 `manifest.json` 누락. 

**Fix 두 개**:

A. **Meta 파일 항상 push** — `publishVault` 의 변경 감지 filter 가 `manifest.json` + `.nojekyll` 은 항상 plan.files 에 유지. 이유: dirtyTracker 의 baseline 이 *plugin 내부 record* 이지 *share repo 의 실제 상태* 가 아님. baseline 갱신됐는데 push 자체는 fail/누락 시 영구 mismatch — meta 파일 항상 push 로 자동 회복.

B. **`Reset publish baseline` 명령어** — `lastPublishedDigest` + `lastPublishedFiles` 초기화. 다음 publish 가 baseline 없는 상태 (일괄 push) 로 진행 → 정상 동기화. share repo 가 외부에서 수정되거나 force-push 된 경우 escape hatch.

### 3.7 v0.1.37 — Fresh PublishOrchestrator 패턴

**증상**: 사용자가 v0.1.36 publish 후에도 manifest 누락 지속. 시간선 분석 — *publish 시점 (18:32)* 이 *v0.1.36 release (18:27)* 후 5분이지만 BRAT auto-update 안 받음. v0.1.34/35 plugin 으로 publish.

**Fix**: PlanFactory 가 매 publish 시 *fresh* PublishOrchestrator 생성. 이전엔 main.ts onload 에서 1회 생성 → settings (publicRoot 등) 변경해도 reload 전엔 옛 값 사용. plugin reload 의무 사라짐.

### 3.8 v0.1.38 — plan.files 의 manifest entry 직접 확인 진단

**증상**: v0.1.37 fix 후에도 사용자 publish 결과 manifest 누락 지속. plan.files 의 *어디* 에서 manifest 가 사라지는지 결정적 진단 정보 부재.

**Fix**: console.log 에 plan.files 의 *manifest 와 .nojekyll entry 직접 출력*. plugin version 기록. 사용자가 콘솔에서 *plan 에 manifest 가 들어가는지* 직접 확인 가능. 단 console 만 — 사용자가 stale BRAT cache 받고 있으면 fix 자체가 적용 안 됨.

### 3.9 v0.1.39 — 진단 로깅 시스템 전체 (FileLogger + Debug mode)

**증상**: 사용자 *"콘솔 말고 다른 어딘가에 파일로 저장... 개발자 모드를 켰을 때만 그게 작동... 체크할 수 있는 로그를 전부 기입"*.

**Fix — services/Logger.ts 신규**:

| 항목 | 내용 |
|---|---|
| `Logger` interface | debug/info/warn/error, 각 category + message + data |
| `FileLogger` 구현 | console 항상 + debug mode 시만 파일 append |
| 위치 | `<vault>/.obsidian/plugins/notedrop/notedrop.log` |
| 메커니즘 | Node `fs.appendFile` (isDesktopOnly=true 라 가능) |
| Rotation | 10MB 초과 시 `.log.1` 으로 1회 rotate |
| 보안 | JSON.stringify replacer 가 secret (`githubPat`, `token`, `pat`, `auth`) 자동 mask |
| Settings UI | 고급 설정 안에 Debug mode toggle |

기록 항목 전체:
- **plugin onload**: version + settings (PAT 제외) + baseline 상태 + publishedSeeds
- **publish 시작**: skipChangeDetection, indexedItemCount, settings 핵심
- **plan 빌드 완료**: totalFileCount, **manifestEntries**, nojekyllEntries, contentEntries, manifestItemsCount, manifestItemTypes, warnings, pathSample (first 10 + last 10)
- **변경 감지**: hasBaseline, addedPaths, modifiedPaths, removedPaths, beforeFilter/afterFilter, afterFilterPaths
- **GitHub Tree API**: 호출 시작 (pushFileCount + pushPaths 전체), 완료 (commitSha, changedFiles, durationMs)
- **에러**: name, message, stack, status

### 3.10 v0.1.40 — bootstrap manifest 덮어쓰기 버그 fix (critical)

**진단 (v0.1.39 의 첫 번째 사용)**: 사용자가 Debug mode 켜고 publish 후 `notedrop.log` 첨부. 핵심 발견:

```json
"manifestEntries": ["manifest.json", "manifest.json"]   ← 같은 path 2번
"contentEntries": [..., "content/welcome/index.md"]    ← 사용자에 없는 welcome
"pushPaths": [..., "index.html", "index.txt", "manifest.json"]  ← bootstrap manifest 가 마지막
```

**근본 원인**:
1. `PublishOrchestrator.plan()` → 사용자 manifest (items=[2 entry]) + content 2개 추가 (`plan.files[0..2]`)
2. `collectViewerFiles()` → viewer.zip unpack → **bootstrap manifest (items=[welcome])** + welcome content + viewer 자산 추가 (`plan.files[3..]`)
3. GitHub Tree API 의 **last-write-wins 동작**: 같은 path 의 entry 가 여러 개면 *마지막 entry 가 적용*
4. plan.files 끝부분 ordering: 사용자 manifest → ... → bootstrap manifest → end. **bootstrap 이 사용자 manifest 를 덮어씀**.

이유: Next.js export 가 `viewer/public/*` (개발 부트스트랩 자산) 을 `out/*` 으로 그대로 복사 → viewer.zip 안에 bootstrap manifest + welcome content 가 포함 → publishViewerAssets 옵션이 그것까지 push.

**Fix**: `collectViewerFiles` 에 `isBootstrapAsset(path)` 가드:
```ts
function isBootstrapAsset(path: string): boolean {
  return path === 'manifest.json' || path.startsWith('content/')
}
```

이 두 path 는 사용자 publish 가 책임 (PublishOrchestrator 가 plan.files 에 추가). viewer 자산에서 명시적 제외.

**검증 (v0.1.40 의 첫 publish)**:
```
"manifestEntries": ["manifest.json"]               ← 1개만 ✓
"contentEntries": ["사용자 노트 2건만"]            ← welcome 사라짐 ✓
"totalFileCount": 144                               ← 146 → 144 (-2) ✓
share repo manifest.json items: [사용자 노트 2건]   ← 정상 갱신 ✓
```

GH Pages 가 사용자 노트 2건 표시.

## 4. 주요 기술 결정 + 우회책

### 4.1 PluginContext = plain object DI

OOP DI 컨테이너 라이브러리 (InversifyJS 등) 대신 **plain object** 채택. 이유:
- 본 프로젝트 규모 (의존 14 필드) 에 적합
- 단위 테스트 시 fake context 직접 생성 가능 (라이브러리 mock 불필요)
- TypeScript 인터페이스만으로 타입 안전성 확보
- bundle size 0 추가

### 4.2 Command 패턴 — 자기 등록 + registry

각 `commands/<name>.ts` 에 두 export:
1. 함수 (구현, 외부 호출자 직접 사용 가능)
2. `<name>Command: CommandDef` (registry 가 import)

`commands/registry.ts` 가 `COMMAND_REGISTRY: readonly CommandDef[]` 단일 array. main.ts 가 iterate 후 addCommand. **새 명령어 = 파일 1 + registry 1줄, main.ts 변경 0**.

### 4.3 PlanFactory = Single Source of Truth

publish plan (manifest + content + viewer 자산) 의 *유일한 출처*. publishVault, forcePublishVault, DirtyTracker.computeSnapshot 모두 같은 함수 호출. 이전엔 publishVault 가 자체 hash 계산 + DirtyTracker 가 따로 → 두 곳에서 동일 알고리즘 중복 + dirty 분류 불일치 위험.

### 4.4 Logger = console + 옵션 file append

console 출력은 항상 (DevTools 즉시 진단). 파일 append 는 **사용자 명시 활성화 (Debug mode)** 후만. 이유:
- 일반 사용자: 파일 누적 부담 없음
- dogfood 사용자: 문제 발생 시 toggle 후 재현 → 파일 첨부 보고
- secret 자동 mask (PAT 등이 로그에 새지 않음)

10MB rotation: append 만 단순. 매우 큰 vault 의 publish 가 누적되어도 size 한계 자동 관리.

### 4.5 Bootstrap 자산 명시적 제외 (Tree API last-write-wins 우회책)

GitHub Tree API 의 *같은 path 여러 entry → 마지막 적용* 동작은 문서화 X. 명시적 deduplication 도 미수행. 사용자 publish 가 의도하지 않은 덮어쓰기 가능. 우회책:

- **명시적 제외 list**: `manifest.json`, `content/**` (사용자 publish 가 책임지는 path)
- 또는 *더 robust*: PlanFactory 가 plan.files 에 path 별 dedup 추가 (마지막 add 만 유지). 단 v2 검토 — 현재 fix 가 핵심 case 해결.

## 5. spec 와의 차이점 변경 요약

이전 postmortem 의 spec 일탈 표 외 본 시리즈에서 추가된 결정:

| 항목 | spec | 실제 | 사유 |
|---|---|---|---|
| `Reset publish baseline` 명령어 | spec 미언급 | 신규 | dirtyTracker 의 baseline 이 share repo 와 mismatch 시 escape hatch |
| `Force publish` 명령어 | spec 미언급 | 신규 | 변경 감지 우회, 의도된 일괄 push (마이그레이션 시점 등) |
| `Debug mode` 토글 + FileLogger | spec 미언급 | 신규 | dogfood 진단 가시성 |
| viewer 자산의 bootstrap 제외 | spec 미언급 | 신규 (v0.1.40) | Tree API last-write-wins 대안 |

이 결정들은 dogfood 결정 (§13 dogfood-ux-requirements.md) 에 추가 명문화의무. 별도 후속 commit.

## 6. 미해결 영역 (v0.1.40 시점)

### 6.1 viewer 자산 push 의 비효율 (구조적)

매 publish (또는 plugin update 후 첫 publish) 마다 viewer 자산 ~140 file 의 blob API 호출 (~70초). base_tree 활용으로 GitHub commit 의 changed files 는 작지만 *plugin → GitHub API 호출 자체* 는 회수만큼.

해결 후보:
- **A. publishViewerAssets 옵션 분리** — 일반 publish = manifest + content (vanilla 패턴 회복). viewer 자산은 별도 `Sync viewer assets` 명령어 (plugin update 후 1회).
- **B. plugin update 자동 감지** — viewer.zip hash 가 변경되면 자동 push. byte 같으면 skip.
- **C. 변경 감지 더 robust** — 매 publish 시 share repo 의 *실제 tree sha* 를 GitHub API 로 가져와 비교. baseline 이 plugin 내부 record 가 아닌 *실 share repo*.

(A) 가 가장 단순. 단 별도 share repo 사용 시 사용자 명시 동기 의무. 다음 patch 검토.

### 6.2 사용자 vault 외 share repo 의 deploy.yml

현재 deploy.yml 은 본 repo (siakun/notedrop) 의 viewer/** 변경 시 GH Pages deploy. 사용자 share repo (siakun/notedrop-share) 는 *별도 repo* 라 deploy.yml 없음. 사용자 publish 가 정적 자산 push → GH Pages 의 *Deploy from a branch* (Settings → Pages) 모드 의존. 단 share repo 가 처음 생성 시 이 설정 사용자 1회 작업.

해결 후보: publish 가 deploy.yml 도 push (1회) 또는 README + .gitignore + LICENSE 등 share repo 초기화 자산.

### 6.3 GH Pages CDN propagation

publish 후 GH Pages 가 1~5분 cache. 사용자 시점에서 *publish 직후 새로고침 → 변경 안 보임* 혼란 가능. publish 완료 Notice 에 *"1~5분 후 GH Pages 갱신"* 명시 추가 검토.

### 6.4 viewer 자산 of stale 잔재 (vanilla 시절)

share repo 의 `app.js`, `style.css` (vanilla 시절 자산) 가 base_tree 보존으로 영구 잔존. 사용자가 GH 웹 UI 에서 직접 삭제 또는 plugin 의 cleanup 명령어 (v2). viewer 동작에 영향 없으므로 우선순위 낮음.

## 7. Lessons Learned

### 7.1 진단 로깅이 critical 버그 즉시 발견

v0.1.39 의 전체 logger 가 *첫 번째 사용* 에서 v0.1.40 의 근본 버그 발견. plan.files 의 `manifestEntries` 배열에 같은 path 2번 등록된 것이 결정적 단서. 진단 시스템이 *없었다면* 이 버그는 *영구히 잠복* 가능.

교훈: **dogfood 단계에서 진단 시스템 우선 도입**. console.log 만으로는 사용자가 보고 못 하는 정보 (예: 큰 array, 구조 깊은 object) 를 file 에 누적해야 분석 가능.

### 7.2 BRAT auto-update 의 cache 한계

사용자가 v0.1.34 plugin 사용 중 → BRAT 가 30분 마다 check → 그 사이 publish 한 결과가 v0.1.34 의 fix 미적용. 사용자 시점에서는 *최신 fix 적용된 줄 알고 publish* 함.

해결: 사용자에게 *manual download + 덮어쓰기* 안내 (BRAT 우회). 또는 plugin 자체 update 알림.

### 7.3 GitHub Tree API last-write-wins 가 silent failure 모드

문서화 안 됨. plan.files 에 같은 path 의 entry 가 두 개 있으면 *에러 없이* 마지막 적용. 사용자 publish 가 의도하지 않은 덮어쓰기 가능. 

교훈: **plan.files 에 path-level deduplication 의무**. 또는 명시적 ordering (사용자 콘텐츠 last). 본 fix 는 *자산 분류 명확화* 로 회피.

### 7.4 main.ts 의 monolithic 책임

이전 v0.1.32 까지 main.ts 가 onload + addCommand 9 + 비즈니스 메서드 ~10 + 헬퍼 ~5 = 365줄. 사용자가 코드 보고 *"캡슐화 부족"* 느낌. 정직한 진단.

교훈: **plugin entry 는 dispatcher 만**. lifecycle + adapter wire-up + service 시작/중지 + 명령어 등록. 비즈니스 로직 0. 본 시리즈에서 134줄로 축소 — 새 명령어 추가 비용 1/2.

### 7.5 사용자 시점 = "왜 이만큼 push 되나" 의 진단 정보 명시

사용자가 Notice "142 파일 push" 를 본 후 *왜 142 인가* 궁금해도 정보 부재 → "마이그레이션 전 동작에서 너무 벗어나는 것 아닌지" 우려. 

교훈: **모든 동작에 *사유* 명문화**. v0.1.35 의 메시지 ("첫 publish (baseline 없음)" / "baseline mismatch" / "force publish" / "변경 감지 결과") 가 사용자 우려 즉시 해소.

### 7.6 PluginContext 가 fresh 의 강제

main.ts onload 시점 캡처된 closure 가 settings 변경 후에도 옛 값 사용 (예: PublishOrchestrator). 사용자가 SettingsTab UI 에서 변경 후 *plugin reload 의무* 가 dogfood UX 결함.

교훈: **settings dependent 인스턴스는 *호출 시* fresh 생성**. v0.1.37 의 PlanFactory 가 매 publish 마다 fresh PublishOrchestrator 생성하는 패턴이 표준.

## 8. Reference

- git tags: 0.1.31 ~ 0.1.40 (10 patches)
- commit 흐름:
  ```
  8760ad6 v0.1.31 dirty 게이트
  575f74c v0.1.32 명령어 캡슐화
  86940c2 v0.1.33 전체 리팩터링
  5844dcd v0.1.34 GH Pages basePath + 변경 감지
  a2f4c2b v0.1.35 진단 로그 + Notice 명확화
  2ee74f3 v0.1.36 manifest 항상 push + baseline reset
  5af4fe4 v0.1.37 fresh orchestrator
  c10e7c7 v0.1.38 plan.files manifest 직접 확인
  89ed8dd v0.1.39 FileLogger + Debug mode
  1e9dcda v0.1.40 bootstrap 자산 제외 (critical fix)
  ```
- 신규 파일:
  - `plugin/src/commands/types.ts` (CommandDef)
  - `plugin/src/commands/registry.ts` (COMMAND_REGISTRY)
  - `plugin/src/commands/forcePublishVault.ts`
  - `plugin/src/commands/resetPublishBaseline.ts`
  - `plugin/src/services/PluginContext.ts`
  - `plugin/src/services/DirtyTracker.ts`
  - `plugin/src/services/SeedPersistence.ts`
  - `plugin/src/services/PlanFactory.ts`
  - `plugin/src/services/Logger.ts`
- 관련 ADR (변경 후보):
  - 0027 (Tree API publish) — last-write-wins 동작 명시 필요. 별도 ADR 또는 본 ADR 의 "알려진 함정" 섹션
- 관련 spec:
  - §13 dogfood-ux-requirements — Reset baseline + Force publish + Debug mode 명령어 추가 명문화의무
- 진단 로그 위치: `<vault>/.obsidian/plugins/notedrop/notedrop.log` (Debug mode 활성 시)
