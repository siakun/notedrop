---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - arc42
  - building-blocks
summary: 플러그인·뷰어 컴포넌트 분해. 모듈별 책임·의존 관계·폴더 구조
---
# 05. Building Block View

[04-solution-strategy.md](04-solution-strategy.md) 의 큰 그림을 컴포넌트 단위로 쪼갠 뷰. 각 모듈이 한 가지 책임만 갖도록 분해.

## 5.1 플러그인 (TypeScript, 옵시디언 Plugin)

3-layer Hexagonal 분해. UI 가 Infrastructure 를 호출하고, Infrastructure 가 Domain 을 호출한다. 의존 방향은 항상 위에서 아래로.

```
┌─────────────────────────────────────────────────────────┐
│ UI Layer                                                │
│  ├── commands.ts          Cmd+P 명령어 등록             │
│  └── SettingsTab.ts       설정 UI                       │
├─────────────────────────────────────────────────────────┤
│ Infrastructure Layer    (옵시디언·Node API 의존)        │
│  ├── LocalServer.ts       HTTP + SSE 서버              │
│  ├── GitPublisher.ts      public 레포 commit·push      │
│  └── VaultEventBridge.ts  Obsidian 이벤트 → Domain     │
├─────────────────────────────────────────────────────────┤
│ Domain Layer            (옵시디언 의존 없음, 순수 TS)       │
│  ├── PublishIndex.ts      인메모리 카탈로그            │
│  ├── ContentResolver.ts   위키링크/임베드 해석         │
│  ├── ContentTransformer.ts HIDE/RENDER/PASSTHROUGH     │
│  ├── AssetCollector.ts    이미지 참조 수집·복사 계획   │
│  ├── BookAssembler.ts     Waypoint/MOC 파싱            │
│  └── ManifestBuilder.ts   manifest.json 생성           │
├─────────────────────────────────────────────────────────┤
│ Ports (인터페이스 - Domain 이 외부에 요구)               │
│  ├── VaultFs              파일 시스템 추상              │
│  ├── MetaCache            MetadataCache 추상            │
│  └── GitClient            git 작업 추상                 │
└─────────────────────────────────────────────────────────┘
```

### 5.1.1 Domain Layer 모듈

| 모듈 | 단일 책임 | 의존 |
|---|---|---|
| **PublishIndex** | "현재 발행된 항목이 무엇이고 hash·slug·render·parent 는?" - 인메모리 Map | VaultFs, MetaCache |
| **ContentResolver** | 한 vault 파일의 위키링크·임베드·이미지 ref 를 해석 → 정규화된 Reference 리스트 | VaultFs, MetaCache, PublishIndex |
| **ContentTransformer** | 마크다운에 HIDE 규칙 + 안전장치 + 이미지 경로 재작성 적용 | ContentResolver |
| **AssetCollector** | 변환 결과의 자산 ref → vault 위치 찾기 (같은 폴더 → 부모 → vault search) → 복사 계획 | VaultFs |
| **BookAssembler** | book entry 파일 → Waypoint > MOC > folder scan 3단 폴백으로 챕터 순서 결정 | VaultFs, MetaCache, PublishIndex |
| **ManifestBuilder** | PublishIndex → manifest.json 직렬화 | PublishIndex |

설계 핵심: Domain 은 옵시디언 의존을 인터페이스 (VaultFs, MetaCache) 로 격리. 테스트에서는 InMemory 구현체로 교체 → 옵시디언 미실행 상태에서도 모든 변환 로직 검증 가능.

### 5.1.2 Infrastructure Layer 모듈

| 모듈 | 책임 | 의존 |
|---|---|---|
| **LocalServer** | `localhost:7777` 에 HTTP + SSE 서버. 라우팅: `/`, `/content/<hash>`, `/manifest.json`, `/__events`. Domain 호출해서 응답 생성 | Node `http`, Domain 전체 |
| **GitPublisher** | Domain 결과물 → 임시 디렉터리 stage → public 레포 push (no-pull) | GitClient (Adapter), Domain 전체 |
| **VaultEventBridge** | 옵시디언 vault·MetadataCache 이벤트 구독 → PublishIndex 갱신 → LocalServer 에 SSE 신호 | Obsidian Plugin API, PublishIndex, LocalServer |

### 5.1.3 Adapters (Ports 의 실제 구현체)

| Adapter | Port | 구현 |
|---|---|---|
| ObsidianVaultFs | VaultFs | `app.vault.adapter` 호출 |
| ObsidianMetaCache | MetaCache | `app.metadataCache` 래핑 + `on('changed')` 등 이벤트 |
| IsomorphicGitClient (또는 ChildProcessGitClient) | GitClient | isomorphic-git 라이브러리 또는 `git` CLI 호출 |
| InMemoryVaultFs | VaultFs | 테스트용 |
| FakeMetaCache | MetaCache | 테스트용 |
| FakeGitClient | GitClient | 호출 시퀀스만 기록 |

### 5.1.4 UI Layer 모듈

| 모듈 | 책임 |
|---|---|
| **commands.ts** | `Cmd+P` 에 명령어 등록: `Notedrop: Share this note`, `Unshare this note`, `Start preview server`, `Stop preview server`, `Clear preview cache`, `Open shared list`, `Copy share URL` |
| **SettingsTab.ts** | 옵시디언 Settings 탭. PAT, target repo (owner/name), port, 자동 시작 토글, Preview server start/stop 토글, 현재 공유 항목 리스트 (각 항목: 제목, 경로, 슬러그, 모드, URL 복사, 공유 해제), `[+ Add]` 버튼 |

## 5.2 뷰어 (Next.js Static SPA)

> **갱신 (v0.1.44 시점, 2026-04-26)**: 본 §5.2 의 Components / Markdown
> Pipeline / Lib / Hooks 목록는 dogfood + 마이그레이션 진화 후 현재
> 구현 반영. macro 결정 (Next.js + React + unified.js + Hexagonal) 그대로.
> 자세한 변경 흐름은 `docs/postmortems/` 참조.

```
┌─────────────────────────────────────────────────────────┐
│ Pages (App Router, output: 'export')                    │
│  └── /                    단일 page, hash routing       │
│      (#/<slug-or-hash>/)                                │
├─────────────────────────────────────────────────────────┤
│ Components                                              │
│  ├── pages/RootClient     hash routing dispatcher       │
│  ├── pages/Home           entry list 카드               │
│  ├── pages/EntryView      doc/book 분기 + paginate      │
│  ├── layout/Header        brand + crumbs + ViewSettings │
│  ├── layout/PageIndicator 우하단 floating pill          │
│  ├── panels/ViewSettings  popover (보기설정 9 섹션)      │
│  ├── book/Toc, ChapterNav 책 모드 사이드바·이전/다음   │
│  ├── markdown/MarkdownRenderer  unified pipeline 호스트 │
│  └── providers/{LiveReload, ViewSettings}Provider       │
├─────────────────────────────────────────────────────────┤
│ Markdown Pipeline (unified + 자체 plugin)               │
│  ├── remark-parse, remark-gfm, remark-math              │
│  ├── remark-callout       > [!info] (자체)              │
│  ├── remark-highlight     ==text== (자체)               │
│  ├── remark-mermaid       ```mermaid (자체, hast pre)   │
│  ├── remark-rehype + rehype-raw + rehype-katex          │
│  └── rehype-stringify     HTML string 출력              │
│  (wikilink/embed plugin 0 — ContentTransformer 가 이미  │
│   markdown 텍스트 수준에서 변환. mermaid 렌더는 클라이  │
│   언트 useEffect mermaid.run())                         │
├─────────────────────────────────────────────────────────┤
│ Lib                                                     │
│  ├── basePath.ts          withBase() placeholder helper │
│  ├── logger.ts            Debug mode 진단               │
│  ├── resource.ts          Resource<T> generic           │
│  ├── router.ts            resolveRoute() 순수 함수      │
│  ├── manifestClient.ts    Resource<Manifest>            │
│  ├── contentClient.ts     Resource<PageContent> + parser │
│  ├── paginate.ts          splitByHeight, computePageFit │
│  ├── stripController.ts   가상 가로 스크롤 wheel hijack │
│  └── viewSettings.ts      load/save/applyViewSettings   │
├─────────────────────────────────────────────────────────┤
│ Hooks                                                   │
│  ├── useManifest          manifest + SSE invalidate     │
│  ├── useContent(hash)     content + SSE invalidate      │
│  ├── useRoute             hash routing + render token   │
│  ├── useCustomCss         페이지별 customCss 격리 주입  │
│  ├── usePageSizeCss       page CSS 변수 갱신            │
│  └── useLayoutPagination  paginate + StripController    │
└─────────────────────────────────────────────────────────┘
```

### 5.2.1 핵심 설계 결정

- **MarkdownRenderer 가 unified pipeline 호스트**: 새 옵시디언 문법 지원 = unified plugin 1개 추가. dangerouslySetInnerHTML 로 HTML string 삽입 → 페이지네이션 로직이 div.entry-content children 직접 조작 가능.
- **LiveReloadProvider 가 환경 자동 분기**: hostname=localhost/127.0.0.1 시만 EventSource 활성. prod 에선 no-op (try-catch).
- **Resource<T> 가 cache + invalidate + subscribe + inflight dedup 추출**: manifestClient + contentClient 가 동일 패턴 재사용.
- **paged.js 폐기**: §13.5.7 paper-page 분리 패턴이 paged.js column 분할과 mismatch. lib/paginate.ts 가 backup vanilla 의 splitByHeight + measure-render 패턴을 React 안에 이식.

## 5.3 의존 그래프 (전체)

플러그인 안 (v0.1.33 리팩터링 후):
```
UI (commands/, settings/SettingsTab)
   ↓
Services (PluginContext, DirtyTracker, SeedPersistence, PlanFactory, Logger)
   ↓
Infrastructure (PreviewServer, GitHubPublisher, VaultEventBridge)
   ↓
Domain (PublishIndex, ContentResolver, ContentTransformer,
        AssetCollector, BookAssembler, ManifestBuilder, PublishOrchestrator)
   ↓
Ports (VaultFs, MetaCache, GitClient)
   ↑ (구현)
Adapters (Obsidian*, InMemory*, Fake*)
```

main.ts 는 dispatcher 만 (134줄): 라이프사이클 + Adapter wire-up + ctx 빌드 + COMMAND_REGISTRY iterate.

뷰어 안 (v0.1.42 리팩터링 후):
```
Pages (app/page.tsx — 단일 hash routing)
   ↓
Components (pages/RootClient → pages/{Home, EntryView} + layout/* + panels/* + book/*)
   ↓
Hooks (useRoute, useManifest, useContent, useLayoutPagination, useCustomCss, usePageSizeCss)
   ↓
Lib (Resource<T>, basePath, logger, router, paginate, stripController, viewSettings)
   ↓
Markdown Pipeline (buildProcessor factory + 자체 remark plugin 3종)
```

플러그인 ↔ 뷰어:
- 인터페이스 = HTTP. `/manifest.json`, `/content/<hash>/index.md`, `/content/<hash>/_assets/*`, `/events` (SSE). 뷰어는 응답이 PreviewServer 에서 오든 GH Pages 정적 파일에서 오든 모름.

## 5.4 폴더 구조 (v0.1.44 시점)

```
notedrop/                                    ← repo root, 모노레포
├── manifest.json                            ← Obsidian plugin 메타 (BRAT root, ADR-0025)
├── styles.css                               ← release asset
├── main.js                                  ← plugin 빌드 산출물 (.gitignore)
├── README.md
├── plugin/                                  ← 옵시디언 플러그인
│   ├── package.json, tsconfig.json, vitest.config.ts
│   ├── esbuild.config.mjs                   ← viewer/out/ → fflate.zipSync 인라인
│   └── src/
│       ├── main.ts                          ← Plugin entry (dispatcher, 134줄)
│       ├── types.ts                         ← public Manifest, ManifestItem, PageFrontmatter
│       ├── settings/
│       │   ├── PluginSettings.ts            ← debugMode 포함 12 필드
│       │   ├── SettingsTab.ts               ← ctx 의존 (plugin reference X)
│       │   └── shareUrl.ts                  ← deriveShareUrlBase
│       ├── commands/                        ← v0.1.33 패턴: CommandDef + registry 자기 등록
│       │   ├── types.ts, registry.ts
│       │   ├── shareNote.ts, unshareNote.ts
│       │   ├── openSharedList.ts, copyShareUrl.ts
│       │   ├── publishVault.ts, forcePublishVault.ts, resetPublishBaseline.ts
│       │   ├── previewServer.ts (start/stop/openPreview 3개)
│       │   └── showPublishDiff.ts
│       ├── services/                        ← v0.1.33 신규 — DI Context + 비즈니스 로직
│       │   ├── PluginContext.ts             ← plain object DI 14 필드
│       │   ├── DirtyTracker.ts              ← §13.4.3
│       │   ├── SeedPersistence.ts           ← §13.4.2
│       │   ├── PlanFactory.ts               ← v0.1.40 — plan 단일 출처 + bootstrap 자산 제외
│       │   └── Logger.ts                    ← v0.1.39 — FileLogger
│       ├── domain/                          ← 옵시디언 의존 0
│       │   ├── PublishIndex.ts, ContentResolver.ts, ContentTransformer.ts
│       │   ├── AssetCollector.ts, BookAssembler.ts, ManifestBuilder.ts
│       │   ├── PublishOrchestrator.ts
│       │   └── types.ts
│       ├── infrastructure/                  ← Adapters
│       │   ├── ObsidianVaultFs.ts, ObsidianMetaCache.ts, VaultEventBridge.ts
│       │   ├── PreviewServer.ts             ← HTTP + SSE + viewer.zip unpack
│       │   └── GitHubPublisher.ts           ← Tree API 6단계
│       ├── ports/                           ← VaultFs, MetaCache, GitClient
│       └── testing/                         ← InMemoryVaultFs, FakeMetaCache, FakeGitClient
└── viewer/                                  ← Next.js Static SPA + React + TypeScript + unified.js
    ├── package.json, tsconfig.json, vitest.config.ts
    ├── next.config.mjs                      ← basePath = '/__NOTEDROP_BASE__' (prod placeholder)
    ├── public/                              ← 정적 자산 (icons/view-settings/*.svg 등)
    └── src/
        ├── app/
        │   ├── layout.tsx, page.tsx         ← 단일 page, hash routing
        │   └── globals.css                  ← 3 테마 + paper-page + view-settings 스타일
        ├── components/
        │   ├── pages/                       ← RootClient, Home, EntryView (route destination)
        │   ├── layout/                      ← Header, PageIndicator (chrome)
        │   ├── panels/                      ← ViewSettingsPanel (popover)
        │   ├── book/                        ← Toc, ChapterNav (책 모드 전용)
        │   ├── markdown/                    ← MarkdownRenderer (host)
        │   └── providers/                   ← LiveReloadProvider, ViewSettingsProvider
        ├── hooks/                           ← useManifest, useContent, useRoute, useCustomCss,
        │                                       usePageSizeCss, useLayoutPagination
        ├── lib/                             ← Resource<T>, basePath, logger, router, paginate,
        │                                       stripController, viewSettings, manifestClient, contentClient
        ├── markdown-pipeline/               ← buildProcessor factory + 자체 remark plugin 3
        │   ├── index.ts, callout-types.ts
        │   ├── remark-callout.ts, remark-highlight.ts, remark-mermaid.ts
        └── types/                           ← manifest, content, viewSettings, pagedjs.d.ts
```

## 5.5 모듈 안정성 등급

| 모듈군 | 변경 빈도 | 안정성 |
|---|---|---|
| Ports (VaultFs, MetaCache, GitClient) | 매우 낮음 | Stable |
| Domain types (PublishedItem, TransformedContent 등) | 낮음 | Stable |
| ManifestItem, PageFrontmatter (public 출력 포맷) | 매우 낮음, 변경 시 manifest version bump | Stable |
| Domain modules 내부 구현 | 중간 | Internal |
| Infrastructure | 중간 | Internal |
| UI | 자주 | Internal |
| Markdown pipeline plugin 추가 | 자주 (새 문법 지원 시) | Pluggable |
| Viewer components | 자주 (UI UX 개선) | Internal |
