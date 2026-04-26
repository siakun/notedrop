---
date: 2026-04-27
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - postmortem
  - migration
  - viewer
summary: 0.0.1 ~ 0.1.30 의 76 commit 흐름. M1~M5 도메인·플러그인·뷰어 구현, vanilla → Next.js 마이그레이션, dogfood 우회책, spec 일탈 사유, 미해결 영역 기록. 다른 세션 인계용 기술 보고서
---

# notedrop 0.0.1 ~ 0.1.30 — 마이그레이션·우회책 엔지니어링 보고

## 1. Executive Summary

notedrop 은 옵시디언 vault 의 일부 노트를 GitHub Pages 정적 뷰어로 발행하는 플러그인이다. spec (arc42 13장 + ADR 24 개) 작성 후 12 일간 76 commit 으로 0.0.1 → 0.1.30 진행. 마일스톤 5 단계 (M1 도메인 → M2 어댑터 → M3 발행 파이프라인 → M4 뷰어 → M5 UX 개선) + Next.js 재작성 1차 완료. **사용자가 명시한 vanilla 시절부터 이월된 1건의 미해결 버그를 제외하면 모든 dogfood 요구사항이 마이그레이션 완료**. 본 문서는 그 흐름·결정·우회책·spec 일탈 사유·미해결 영역을 다른 세션이 인계받을 수 있도록 기술적으로 기록한다.

핵심 수치:
- commit 76 / tag 30 (0.0.1, 0.1.0~0.1.30)
- plugin 단위 테스트 211 / vitest 16 파일 (도메인 90%+ 커버리지, 안전장치 100%)
- viewer 컴포넌트·라이브러리 26 파일, markdown pipeline 자체 plugin 3 개
- main.js 산출물 ~7.4MB (viewer 자산 zip 인라인 후)
- 활성 ADR 28 개 (그 중 0026 Rejected, 0027 Accepted 사용자 검토 후 기록)

## 2. Background — 의도된 spec

`docs/05-building-blocks.md` §5.1~5.4 가 두 영역의 목표 형태를 표준으로 두었다.

**플러그인 (TypeScript)**: 3-layer Hexagonal — UI / Infrastructure / Domain. Domain 은 `VaultFs · MetaCache · GitClient` 3 ports 만 의존, 옵시디언 코드 0. Adapters 가 Port 의 Obsidian/InMemory/Fake 구현체.

**뷰어 (Next.js Static SPA)**: `output: 'export'` + `'use client'` (ADR-0011). 마크다운은 unified.js (remark/rehype) 표준 파이프라인 (ADR-0012) — 옵시디언 문법은 plugin 1개 추가 = 새 문법 1개 지원.

발행은 GitClient (`isomorphic-git` 가정, ADR-0001 의 vault private + share repo public 구조). 라이브 미리보기는 `localhost:7777` HTTP + SSE (ADR-0014, 실 사용 시 4321 로 변경됨).

이 의도가 본 보고서 전체의 비교 baseline 이다.

## 3. Timeline

### 3.1 M1 — Domain Layer (commit `a5d4fb5` ~ `c3b3457`, 16 commit)

목표: 옵시디언 없이도 모든 변환 로직 검증 가능한 상태.

산출:
- Public types: `Manifest · ManifestItem · PageFrontmatter` (cross-boundary 안정 타입, 변경 시 manifest version bump)
- Domain types: `PublishedItem · Reference · ResolvedContent · TransformedContent · AssetRef · ChapterPlan`
- Ports: `VaultFs · MetaCache · GitClient` 인터페이스만 (의존 0)
- Test fakes: `InMemoryVaultFs · FakeMetaCache · FakeGitClient` + 자체 단위 테스트 30개
- Domain 6 모듈:
  - `PublishIndex` — 인메모리 카탈로그, render 자동 감지 (Waypoint 폴더 패턴), seed 기반 hash 영속화 진입점
  - `ContentResolver` — 위키링크/임베드/이미지 ref 추출 + PublishIndex 조회로 해석
  - `ContentTransformer` — frontmatter 정화, HIDE 정책 (`%%`, Waypoint), 미발행 ref 안전망 (재귀 깊이 1, alias-only 노출 차단), 이미지 절대화, customCss sanitize
  - `AssetCollector` — 자산 ref → vault 위치 검색 (같은 폴더 → 부모 → vault search) + writer 콜백
  - `BookAssembler` — Waypoint > MOC > folder scan 3-fall back
  - `ManifestBuilder` — 직렬화 + null 필드 생략

검증: vitest 211 통과 (시점 179, 이후 누적), 의존 없음 (옵시디언 import 없음 grep 통과).

설계 가치: M1 끝 시점에 옵시디언 GUI 0 회 띄우고도 모든 마크다운 변환 로직이 자동화 검증되었다. 이게 본 프로젝트의 가장 큰 자산이며 이후 모든 마이그레이션이 *Domain 은 변경 0* 으로 진행 가능했던 이유.

### 3.2 M2 — Adapters + Plugin Entry (commit `dfc3832` ~ `9aa14a3`)

목표: Domain 을 옵시디언 환경에 연결.

산출:
- `ObsidianVaultFs` (app.vault.adapter), `ObsidianMetaCache` (app.metadataCache + on()) — `EventRef → unsubscribe fn` 시그니처 wrap
- `VaultEventBridge` — 200ms 디바운스 + PublishIndex 갱신
- `main.ts` Plugin entry, manifest.json 루트 배치 (ADR-0025, BRAT 호환)
- `esbuild.config.mjs` cjs + externals
- `Settings/SettingsTab` + 4 commands (Share/Unshare/OpenList/CopyURL)
- `release.yml` GH Actions (semver tag → manifest 검증 → typecheck/test/build → asset upload)
- `README.md` BRAT 설치 가이드

이 단계가 BRAT 가 `https://github.com/siakun/notedrop` URL 입력 → 설치 진행 가능 상태에 도달. 메타: id `notedrop`, 0.0.1, isDesktopOnly true (Node http 의존).

### 3.3 M3 — Publishing Pipeline (commit `d981098`)

GitHub Tree API 6단계 시퀀스 (refs → commits → blobs → trees → commits → patch refs). 빈 repo 폴백 (404/409 → POST /git/refs). PAT Bearer + GitHubAuthError/GitHubApiError 분기.

이 시점부터 spec §5.1 의 IsomorphicGitClient 가정 일탈. 사후 ADR-0027 명문화. 사유는 §4.2 참조.

### 3.4 M4 — Viewer 1차 (vanilla, commit `4e5dfe1` ~ `247a321`)

자율 run 이 spec §5.2 의 Next.js + React + unified.js 표준을 vanilla JS + esbuild + marked + DOMPurify 로 자율 변경. 사후 ADR-0026 작성 ("autonomous run 단순화"). v0.1.0 release.

이 결정이 본 보고서의 가장 큰 *후행 정정 사례*. 사용자 검토에서 Rejected 되어 §3.6 에서 다시 마이그레이션. 자율 권한이 spec macro 결정에 미치지 않음을 메모리 가드레일에 정착.

### 3.5 v0.1.0 ~ v0.1.24 — dogfood 패치 24개 (UX 개선)

사용자 dogfood 중 발견된 UX·운영 결정. 24 patch 를 큰 묶음 5 개로 정리:

| 묶음 | 패치 | 핵심 변경 |
|---|---|---|
| 운영 골격 | 0.1.1~0.1.6 | localhost PreviewServer + 빈 repo 422 폴백 + .nojekyll + viewer 자산 push + SSE + UUID dashed + hash 영속화 + share URL `#/` 형식 |
| Settings UX 개선 | 0.1.7~0.1.13 | Share URL 자동 도출 (targetRepo 1번 묻기) + Publish 버튼 + dirty 추적 (즉시 boolean + lazy digest 정정) + diff Modal (side-by-side line+word) + 메뉴 재정리 + 고급 설정 단일 collapsible |
| publicRoot 사슬 | 0.1.14~0.1.16 | 빈 publicRoot 422/404 두 fix + 다크 모드 (Notion-dark) 기본 |
| View Settings | 0.1.17~0.1.18 | Day/Sepia/Night + font/size/spacing/align panel + TDZ 에러 fix |
| Layout 4종 | 0.1.19~0.1.24 | Default/Vertical/Horizontal/TwoPages + page size + margins + page indicator + paper-page 컴포넌트 분리 + virtual page-flip + viewport-fit + race condition cleanup |

이 24 patch 의 결정 시퀀스가 너무 비자명해 별도 spec `docs/13-dogfood-ux-requirements.md` 로 기록 (행동·표면 결정 누적, ADR 와 분리).

### 3.6 ADR Reject + Next.js 재작성 결정 (commit `6fe56b6` ~ `1339cc9`)

사용자가 0.1.24 시점에서 0026/0027 ADR 검토. 결정:
- ADR-0026 (vanilla SPA) → **Rejected**, spec §5.2 + ADR-0011 표준 복귀
- ADR-0027 (Tree API) → **Accepted**, spec §5.1 의 IsomorphicGitClient 부분 supersede

backup brench `backup-vanilla-viewer` 에 vanilla v0.1.24 전체 보존 (HEAD = `1339cc9`). 사용자 회복 의무 시 `git checkout backup-vanilla-viewer -- viewer/`.

### 3.7 v0.1.25 ~ v0.1.30 — Next.js 마이그레이션 (commit `a040891` ~ `eb174e8`)

본 보고서가 다루는 핵심 변경. plan `docs/superpowers/plans/2026-04-26-viewer-rewrite.md` P1~P7. 8 commit + 6 patch.

**phase 별 산출**:
- P1~P6 (`4450066`): Next.js 14 + React 18 + TS strict + unified.js + 자체 remark plugin 3 (callout/highlight/mermaid) + paged.js 통합 시도 + 컴포넌트 18 개
- P7 (`95f46b8`): plugin esbuild 갱신 (viewer/dist 3 파일 → viewer/out/ 재귀 zip + fflate.zipSync), PreviewServer zip unpack, deploy.yml 신규 (vanilla 시절 0.1.9 에서 한 번 제거됐던 것 재도입)

**v0.1.25 fail → v0.1.26 fix (`1d7308d`)**: release.yml 의 plugin build 단계가 `publishVault.ts` 의 vanilla 자산 import (`../embedded/index.html` 등) 못 찾음. esbuild fail. fix: `collectViewerFiles()` 가 `viewer.zip.b64` unpack 후 mime 추론하여 plan.files 에 추가. tag 0.1.25 삭제 + 0.1.26 새 release.

**v0.1.27 fix (`5e8baf7`)**: dogfood 중 entry 카드 클릭 시 `/<hash>` 404 발견. Next.js export 의 `dynamicParams: false` 한계 — 빌드 시점 manifest 의 hash 만 사전 생성, 사용자 publish 후 새 hash 는 viewer.zip 에 없음. 해결: hash fragment 라우팅 (`#/<slug-or-hash>/`). plan 의 spec 결정 공백 #3 옵션 A (manifest-driven generateStaticParams) 폐기, 옵션 B (hash routing) 채택.

**v0.1.28 (`444db69`)**: §13 dogfood UX 가 본 마이그레이션에서 대부분 누락된 것이 사용자 지적으로 발견. backup app.js 855줄 + style.css 1039줄 패턴을 React 구조에 이식. ViewSettingsPanel + 4 layout + paper-page 분리 + StripController + 3 themes + JIS B + 4-margin + page indicator + LIVE 뱃지 색 + render token 회복.

**v0.1.29 fix (`1e34368`)**: ViewSettings 패널 열기 시 React error #185 (Maximum update depth exceeded). 원인: `MarkdownRenderer` useEffect deps 에 `onContentReady` 가 있는데 부모 `EntryView` 가 매 render 마다 새 함수 ref → 무한 루프. 해결: stable callback ref 패턴.

**v0.1.30 fix (`eb174e8`)**: Horizontal/Two Pages 레이아웃의 doc 모드 paper-page 안 보임. 원인: backup vanilla 의 doc 모드는 `.app-shell > .entry-content` 직접 구조라 article 없었음. React 마이그레이션이 doc/book 양쪽 모두 article 감쌌는데 CSS 셀렉터 `.app-shell.book article` (book 한정) 만 height 처리 → doc article height 0 → 자식 0 → strip invisible. 해결: 셀렉터 `.app-shell article` 로 완화.

## 4. 주요 기술 결정 + 우회책

### 4.1 Hexagonal Architecture (그대로 spec)

ports/adapters/domain 분리 + 단위 테스트 fake 3 개. M1 끝 시점에 211 단위 테스트 + 옵시디언 GUI 0 회. M2 이후 모든 마이그레이션이 Domain 변경 0 으로 진행됨 — 이 패턴이 본 프로젝트의 회복력 핵심.

### 4.2 GitHub Tree API publish (ADR-0027, spec 일탈)

spec §5.1 의 isomorphic-git 가정에서 Tree API 로 변경. 트레이드오프:

| 측면 | isomorphic-git | Tree API |
|---|---|---|
| 의존 | ~700KB JS | 0 (fetch only) |
| 로컬 디스크 | 클론 디렉터리 (어디?) | 안 씀 |
| atomic commit | OK | OK (단일 commit, base_tree 활용) |
| 첫 publish | 큰 repo 클론 수십 초 | 즉시 |
| rate limit | 없음 | 5000/hr (PAT) |
| blob 한계 | git 100MB | 5MB 추천 (LFS v2) |
| OS 호환 | 같음 (lib 자체 구현) | 같음 (fetch) |

vault 사이드카 회피 (ADR-0018) 와 정합성, 의존 없음 가 가장 큰 가치. dogfood 단계 (본인 한정) rate limit 충분. 다중 사용자 시 재평가는 v2.

### 4.3 viewer 자산 = zip 인라인 (옵션 B)

P7 통합 시 3 옵션 비교:

| 옵션 | 패턴 | 장단 |
|---|---|---|
| A | out/ 의 모든 파일을 esbuild import 선언 | 파일 이름 hash 가변 (chunk) → 빌드마다 import 선언 달라짐 → 비현실적 |
| **B** | out/ 전체 fflate.zipSync → base64 → `.b64` esbuild loader text | main.js 비대 (~7.4MB), 단일 자산, 빌드마다 자동 갱신 |
| C | plugin 디렉터리에 out/ 사이드카 배치 | ADR-0018 vault 사이드카 금지 위반 가능, 옵시디언 디렉터리 관리 부담 |

옵션 B 채택. main.js 사이즈 vanilla 시절 ~200KB → 7.4MB (37x 증가) 가 부정적 트레이드오프. BRAT 첫 다운로드만 부담이며 옵시디언 plugin 으로 큰 편이지만 Excalidraw 같은 선례 있음.

### 4.4 Next.js Static Export + hash 라우팅 (spec ADR-0011 부분 일탈)

의도된 형식: `https://siakun.github.io/notedrop/<hash>/`. 시도 패턴:
- `app/[hash]/page.tsx` + `dynamicParams: false` + `generateStaticParams()` 가 빌드 시 `viewer/public/manifest.json` 읽고 모든 hash 사전 생성

dogfood 에서 발견된 한계: 사용자 publish 후 새 hash 가 main 의 viewer/public/manifest.json 에는 박히지만, plugin/PreviewServer 가 들고 있는 viewer.zip 안의 generateStaticParams 결과는 *빌드 시점 manifest* 기준. 즉:
- GH Pages: deploy.yml 가 manifest 변경 후 자동 재빌드 → 정상
- PreviewServer (옵시디언 안): 새 hash 의 정적 HTML 없음 → 404

회유: hash fragment 라우팅 (`#/<slug-or-hash>/`). 단일 `app/page.tsx` 가 client 측에서 `location.hash` 파싱 → home/entry 분기. dynamic route 폐기. URL 의 path 형식은 잃지만 publish 후 즉시 viewer 진입 가능 + viewer 가 1 페이지만 export 라 빌드 시간/사이즈 절감.

plugin 의 `copyShareUrl` 도 같은 형식 (`<base>/#/<slug>/`). ContentTransformer 의 wikilink 변환도 `[text](#/<slug>/)`.

### 4.5 markdown 파이프라인 = unified + rehype-stringify (rehype-react X)

P3 초기 안: rehype-react 로 mdast → React 트리 + 컴포넌트 매핑 (Callout/Mermaid/DeadLink/EmbedPlaceholder). 깨끗한 React 패턴.

P9 (§13 회복) 시 발견: paginateVertical/paginateStrip 가 div.entry-content 의 children 을 측정 + 여러 paper-page 로 *재분배* 의무. React 가 children 을 reconciliation 으로 관리하면 DOM 직접 조작과 충돌 (key 변경 시 unmount 발생, ref 안정성 X).

회유: rehype-stringify 로 HTML string 받아 `dangerouslySetInnerHTML` 삽입. 페이지네이션 함수가 div 의 children 을 자유롭게 옮길 수 있음 (React 가 그 안 children 안 봄). 콜아웃·임베드 placeholder 등은 CSS attr() 매핑 (`.callout::before { content: attr(data-callout-title); }`).

Mermaid 만 useEffect 안에서 `mermaid.render(id, source)` 호출 후 svg 삽입 (`<pre.mermaid data-source="...">` → `<div.mermaid-rendered>` 교체).

### 4.6 paged.js 폐기 + 자체 페이지네이션

P5 초기 안: paged.js 로 paper-page 분할 + page CSS @page 적용. dynamic import (SSR 회피).

§13.5.7 dogfood 요구 사양:
- 모든 children 을 임시 paper-page 1 개에 넣어 측정 → `flat.map(c => c.offsetHeight)` → `splitByHeight` 로 group 분배 → group 마다 새 paper-page 생성

이는 paged.js 의 column 기반 분할과 mismatch. paged.js 가 단일 source HTML 을 column 단위로 chunk. backup vanilla 의 패턴은 *element 단위 height 누적* 방식. 매핑 어려움.

회유: paged.js 의존 폐기 (~수백 KB 절감) + backup 의 splitByHeight + measure-render 패턴 그대로 React 안에 이식 (lib/paginate.ts).

### 4.7 GH Pages 자동 활성화 (대안 불가능, 사용자 1 회 작업)

`actions/configure-pages@v5` 의 `enablement: true` 옵션이 GITHUB_TOKEN 의 default permission scope (`pages: write`) 으로는 부족. `Resource not accessible by integration` 에러. 추가 `administration: write` 필요하지만 default workflow token 에 없음.

대안:
- (1) PAT 도입: 사용자 GitHub 계정 secret 으로 PAT 추가. 토큰 관리 부담.
- (2) 사용자 1 회: Settings → Pages → Source = "GitHub Actions" 수동 설정.

(2) 채택. 자동화 불가능한 영역 — 사용자 시점에서 1 회만 클릭. 이후 deploy.yml 자동 작동.

### 4.8 React 18 stable callback ref (v0.1.29 fix)

```ts
// 잘못된 패턴 (무한 루프)
useEffect(() => { ... cb() }, [body, pageHash, onContentReady])

// stable ref 패턴
const cbRef = useRef(onContentReady)
useEffect(() => { cbRef.current = onContentReady }, [onContentReady])
useEffect(() => { ... cbRef.current?.() }, [body, pageHash])
```

부모가 매 render 마다 새 콜백 함수 ref 를 생성하면 deps 비교 (Object.is) 가 false → effect 재실행 → setState → re-render → ... 무한.

이 패턴은 본 마이그레이션 후반에 React 18 의 표준 권장사항. 컴포넌트 인터페이스에 `onX` 콜백 prop 가 있으면 의무적으로 ref 패턴 또는 useCallback 안정화.

## 5. spec 와의 차이점 요약

| 항목 | spec | 실제 | 사유 |
|---|---|---|---|
| viewer 라우팅 | path `/<hash>` (ADR-0011) | hash `#/<hash>/` | Next.js export `dynamicParams: false` 한계 |
| publish lib | isomorphic-git (§5.1) | GitHub Tree API | ADR-0027 (사용자 Accept) — vault 사이드카 회피 + 의존 없음 |
| viewer plugin set | wikilink/embed remark plugin (§5.2) | callout/highlight/mermaid 만 자체 | ContentTransformer (plugin) 가 wikilink/embed 를 markdown 텍스트 수준에서 이미 변환 |
| markdown pipeline 출력 | rehype-react → React 트리 | rehype-stringify → HTML string | 페이지네이션이 children 직접 조작 필요 |
| 페이지 사이즈 | A3/A4/A5/B5/B6 (§11.1.2) | B4/A4/B5/A5 (§13.5.4) | 한국 학술 관행 (JIS B), dogfood 결정 |
| 테마 | Light only (§11.1.2) | Day/Sepia/Night (§13.5.2) | dogfood 결정, Notion-dark 톤 통일 |
| paged.js | 명시 (§5.2 + §11.1.2) | 자체 페이지네이션 | §13.5.7 paper-page 분리 사양과 mismatch |
| manifest 위치 | plugin/manifest.json (§5.4) | repo root (ADR-0025) | BRAT 호환 (외부 강제) |
| publish 자산 viewer | viewer/ 별도 발행 또는 deploy.yml | viewer.zip 인라인 + publishViewerAssets push | share repo 가 본 repo 와 다를 때를 위함, ADR-0018 사이드카 회피 |
| port preview | 7777 (ADR-0014) | 4321 | 운영상 변경 (구체 사유 commit log 미명시) |

## 6. 미해결 영역

### 6.1 [PLACEHOLDER] vanilla 시절부터 이월된 알려진 1건

사용자가 "고치기 어려운 버그 1개" 로 명시. 본 보고서 시점 구체 명시 없음. 다음 세션에서 사용자 보고 받아 별도 commit/issue 로 정착의무.

의심 후보 (commit 흐름·dogfood 핸드오프 기반 추측):
- (a) ContentTransformer.sanitizeCss 가 IFRAME / @font-face / WebSocket / data: URL 누락 가능 — 9.7 표 외 패턴
- (b) book 모드의 chapter 간 navigation (`#/<book>/<chapter>` 또는 `#/<chapter>/`) 시 paper-page race — vanilla 0.1.24 의 stripController cleanup fix 후에도 잔존 가능
- (c) 5MB 초과 자산 publish 시 GitHub Tree API blob 한계 — 검증 미완 (메모리 의 v0.1.0 핸드오프 §4 미검증 항목 잔존)
- (d) iOS Safari · Firefox 의 EventSource keepalive 동작 차이 (`X-Accel-Buffering: no`, 25s ping) — 1시간 연속 사용 검증 미완
- (e) horizontal/two-pages 의 wheel hijack 이 trackpad inertia (deltaY 가 momentum 에 의해 다중 발사) 와 충돌 — `e.preventDefault()` + `advance(±1)` 만으로 trackpad 한 swipe 가 여러 페이지 advance 가능
- (f) Mermaid 의 dynamic import 가 큰 그래프 (~수백 노드) 또는 여러 동시 graph 시 DOM race
- (g) View Settings 의 fontScale 변경이 페이지네이션 재계산 trigger 안 함 (CSS 변수만 갱신, paginateVertical 다시 호출 안 됨) — 사용자가 fontScale 키운 후 layout=vertical 로 가면 텍스트 over flow 가능

다음 세션 첫 작업으로 사용자에게 1건 명시 요청 + fix.

### 6.2 main.js 사이즈 7.4MB

vanilla ~200KB → 7.4MB (37x). BRAT 첫 다운로드만 부담. v2 검토:
- 변경 감지 publish (이전 manifest 비교 → 변경된 blob 만 push) — Tree API base_tree 활용 시 효과 더 큼
- viewer.zip 의 chunk 별 lazy 로딩 (PreviewServer 가 시작 시 메타만 unpack, 실제 파일은 요청 시)
- React 18 + Next.js 의 자체 size — 19+ 또는 Vite + React Router 로 마이그레이션 시 ~30% 절감 예상

### 6.3 release.yml + deploy.yml 분리 vs 통합

현재:
- release.yml: tag push → BRAT release (main.js + manifest.json + styles.css)
- deploy.yml: main 브랜치 viewer/** 변경 → next build → GH Pages

publish 흐름:
1. 사용자가 옵시디언에서 publish → plugin 이 Tree API 로 publish 대상 repo 의 main 에 commit
2. publish 대상 = 본 repo (siakun/notedrop): deploy.yml 자동 trigger, 1~2 분 후 GH Pages 갱신
3. publish 대상 = 별도 share repo: 그 repo 에는 deploy.yml 없음. publishViewerAssets 옵션 ON 하여 viewer 자산도 같이 push 하면 GH Pages 가 정적 호스팅 (Jekyll 비활성, .nojekyll 자동 포함)

별도 share repo 사용자가 deploy.yml 직접 추가하는 패턴은 v2 문서화 예정.

### 6.4 GH Pages 사이트 활성화 (사용자 1 회)

`configure-pages@v5` enablement 권한 부족. PAT 도입 또는 사용자 수동. 첫 dogfood 시 사용자 1 회 Settings → Pages → Source = "GitHub Actions".

### 6.5 Render token + SSE coalesce 검증 미완

§13.6.1 `renderToken` 패턴 + §13.6.2 `reloadRunning + reloadPending` 직렬화. dogfood 단발 검증 (수십 분) 만 통과. 1 시간 연속 사용 + 빠른 연속 vault 저장 (자동 저장) 시 leak 또는 race 잔존 가능. v0.1.0 핸드오프 §4 의 미검증 항목 그대로 잔존.

## 7. Lessons Learned

### 7.1 spec macro 결정은 자율 변경 금지

M4 의 vanilla 자율 ADR-0026 이 spec §5.2/§5.4 의 Next.js + React + unified.js 골격을 전부 누락. 사후 정당화 ("autonomous run 단순화") 가 macro 결정을 뒤집을 권한이 아님. 메모리 가드레일 정착:

> Spec macro 결정 자율 변경 금지: 기술 스택·라이브러리 / 폴더 구조 / 아키텍처 패턴 / MVP 범위. 자율 ADR 작성 시 status 는 반드시 "Proposed, 사용자 검토 필요". 외부 강제 (BRAT, GitHub API 한계, OS 호환) 는 ADR + Accepted OK.

### 7.2 dogfood 가 사양을 형성

v0.1.7~0.1.24 의 24 patch = 사용자가 dogfood 중 발견한 UX 결정 누적. 별도 spec `docs/13-dogfood-ux-requirements.md` 신설 — 행동·표면 결정 (메뉴 구조, 클래스 명명, localStorage 키, 색 팔레트 등). ADR (아키텍처 결정) 와 분리.

이 13장 spec 이 본 마이그레이션의 의무 명세서. M4 자율 run 이 이 결정 시퀀스를 누락한 게 v0.1.28 회복의 근본 사유.

### 7.3 마이그레이션 = backup 보존 + phase 별 commit boundary

backup-vanilla-viewer 브랜치에 v0.1.24 vanilla 전체 보존 (main 의 viewer/dist + plugin/src/embedded 가 vanilla 시절 자산이라 backup 도 자산 보존). 새 main 에서 P1~P7 phase 별 commit. 사용자가 회복 의무 시 `git checkout backup-vanilla-viewer -- viewer/`.

### 7.4 "다 끝낸 것 같다" 가 가장 위험

v0.1.25 release.yml fail. P1~P7 통합 빌드 검증 후 push 했지만 publishVault.ts 의 vanilla import 잔재 발견. 통합 빌드 (`cd plugin && npm run build` + 211 단위 테스트) 가 P7 끝에서 통과했음에도 — release.yml 의 prod build (NODE_ENV=production) 가 다른 import resolution. 

실 release tag push 후에야 발견. 회유: tag 0.1.25 origin 삭제 + 0.1.26 새 release. 단순한 회유지만 release entry 가 안 만들어진 시점에 즉시 발견됐기에 가능.

교훈: release.yml 의 모든 단계를 로컬에서 재현하는 검증 스크립트가 필요. `cd plugin && NODE_ENV=production npm run build` 로컬 재현 시 발견 가능했음.

### 7.5 React 18 stable callback ref

useEffect deps 에 콜백 prop 직접 넣으면 부모 re-render 마다 effect 재실행. ref 패턴으로 안정화. v0.1.29 React error #185 fix. 모든 컴포넌트 인터페이스의 `onX` 콜백 prop 의무 검토.

### 7.6 CSS 셀렉터의 implicit 가정

backup vanilla 의 `.app-shell.book article` 셀렉터가 *doc 모드에 article 없음* 을 implicit 가정. React 마이그레이션이 doc/book 양쪽 모두 article emit 하도록 변경 → CSS 가정 깨짐 → horizontal/two-pages doc 모드 paper-page 안 보임. v0.1.30 fix.

교훈: vanilla → React 마이그레이션 시 *DOM 구조 변경 없이 텍스트 ↔ 컴포넌트 매핑* 만 하는 게 안전. 만약 React 가 article 을 추가 요소로 emit 한다면 CSS 의 모든 셀렉터를 그 가정에 맞춰 갱신 의무.

### 7.7 P7 통합 boundary 가 main 작동 boundary

P1~P6 phase 별 commit 도중 main 의 plugin/main.js 가 vanilla viewer 인라인 그대로 (viewer/dist + plugin/src/embedded 보존). BRAT 사용자 dogfood 진행에 막힘 0. P7 끝에서 한 번에 swap. 이게 가능했던 이유: viewer/dist + plugin/src/embedded 가 .gitignored 라 git 차원에서 보존 X 지만 *로컬 디스크* 에 vanilla 산출물이 잔존. 마지막 빌드의 fortuitous 잔재.

견고한 패턴: 마이그레이션 phase 마다 main 작동 가능 commit boundary 명시. P1~P6 동안 의도적으로 main 깨지지 않도록 (vanilla 임베드 보존 정책) — 본 마이그레이션은 .gitignored 잔재로 우연히 작동했지만, 다음 마이그레이션은 명시적 보존이 필요.

## 8. Reference

- git tags: `0.0.1`, `0.1.0` ~ `0.1.30` (76 commits)
- backup branch: `backup-vanilla-viewer` (HEAD = `1339cc9`, vanilla 마지막)
- 관련 ADR:
  - 0001 (2-repo private vault + public share)
  - 0008 (HIDE/RENDER/PASSTHROUGH)
  - 0009 (미발행 ref 안전망)
  - 0011 (Static SPA: Next.js export + 'use client')
  - 0012 (Hexagonal + unified.js)
  - 0014 (라이브 미리보기 HTTP + SSE)
  - 0017 (자산 챕터별 hash 디렉터리)
  - 0018 (vault 사이드카 금지)
  - 0025 (manifest 위치 = repo root, BRAT)
  - 0026 (vanilla SPA, Rejected)
  - 0027 (GitHub Tree API, Accepted)
- 관련 spec 챕터:
  - §5.1 플러그인 빌딩 블록
  - §5.2 뷰어 빌딩 블록
  - §5.4 폴더 구조
  - §6.4~6.6 변환 파이프라인 + 캐시 + SSE
  - §11.1.2 MVP 뷰어 기능
  - §11.4 release readiness gate
  - §13 dogfood UX 요구사항 (v0.1.7 이후 누적)
- 핸드오프 (`docs/superpowers/handoffs/`):
  - `2026-04-26-m2-session-start.md` (M1 → M2 인계)
  - `2026-04-26-v0-1-0-completion.md` (v0.1.0 자율 run 인계)
  - `2026-04-26-viewer-rewrite-session-start.md` (Next.js 마이그레이션 시작)
  - `2026-04-26-viewer-rewrite-completion.md` (마이그레이션 완료, P8 dogfood 인계)
- 메모리 (`%APPDATA%/.claude/.../memory/`):
  - `project_notedrop_세션간_핸드오프.md` (다세션 프로토콜)
  - `project_notedrop_코드맵.md` ("X 바꾸려면 어디?" + 빌드 의존 체인)
  - `feedback_커밋_메시지_특수문자.md` (gitmoji + 한국어 컨벤션)
  - `feedback_설계원칙_구조적해결.md` (구조적 원인 우선)
