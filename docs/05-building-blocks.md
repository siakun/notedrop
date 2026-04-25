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
│ Domain Layer            (옵시디언 의존 0, 순수 TS)       │
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

설계 핵심: Domain 은 옵시디언 의존을 인터페이스 (VaultFs, MetaCache) 로 격리. 테스트에선 InMemory 구현체로 교체 → 옵시디언 안 켜져도 모든 변환 로직 검증 가능.

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

```
┌─────────────────────────────────────────────────────────┐
│ Pages (App Router, output: 'export')                    │
│  ├── /                    public list (homepage)        │
│  └── /[hash]              single entry (book or doc)    │
├─────────────────────────────────────────────────────────┤
│ Components                                              │
│  ├── BookViewer           paged.js + 사이드바 TOC       │
│  ├── DocViewer            paged.js                      │
│  ├── Sidebar              책 모드 챕터 네비             │
│  ├── MarkdownRenderer     unified pipeline 호스트       │
│  ├── PageSizeSelector     A3/A4/A5/B5/B6 토글          │
│  ├── DownloadPDFButton    window.print()                │
│  └── LiveReloadProvider   dev: SSE 구독, prod: no-op   │
├─────────────────────────────────────────────────────────┤
│ Markdown Pipeline (unified plugins)                     │
│  ├── remark-wikilink         [[Note]]                   │
│  ├── remark-obsidian-embed   ![[Note]]                  │
│  ├── remark-callout          > [!info]                  │
│  ├── remark-math             $$ $$                      │
│  ├── rehype-katex            수식 렌더                  │
│  ├── rehype-mermaid          mermaid 렌더               │
│  └── rehype-react            hast → React               │
├─────────────────────────────────────────────────────────┤
│ Lib                                                     │
│  ├── manifestClient.ts    manifest.json fetch + cache   │
│  ├── contentClient.ts     /content/<hash> fetch + cache │
│  ├── cssInjector.ts       페이지별 customCss 주입·격리  │
│  └── paginationConfig.ts  사이즈 → paged.js 옵션        │
├─────────────────────────────────────────────────────────┤
│ Hooks                                                   │
│  ├── usePageSize          사이즈 상태 + localStorage    │
│  ├── useContent(hash)     content fetch + 캐시 + SSE    │
│  ├── useManifest          manifest fetch + 캐시 + SSE   │
│  └── useLiveReload        dev: SSE 구독                 │
└─────────────────────────────────────────────────────────┘
```

### 5.2.1 핵심 설계 결정

- **MarkdownRenderer 가 unified pipeline 의 호스트**: 새 옵시디언 문법 지원 = unified plugin 1개 추가. 다른 컴포넌트 안 건드림.
- **LiveReloadProvider 가 dev-only**: 환경변수로 prod 빌드 시 no-op 으로 컴파일 → 번들에 안 들어감.
- **contentClient 가 캐시 보유**: SPA 네비게이션 시 같은 콘텐츠 재요청 X. SSE 신호 받으면 해당 hash 만 invalidate.

## 5.3 의존 그래프 (전체)

플러그인 안:
```
UI (commands, SettingsTab)
   ↓
Infrastructure (LocalServer, GitPublisher, VaultEventBridge)
   ↓
Domain (PublishIndex, ContentResolver, ContentTransformer,
        AssetCollector, BookAssembler, ManifestBuilder)
   ↓
Ports (VaultFs, MetaCache, GitClient)
   ↑ (구현)
Adapters (Obsidian*, Isomorphic*, InMemory*, Fake*)
```

뷰어 안:
```
Pages (/, /[hash])
   ↓
Components (BookViewer, MarkdownRenderer, ...)
   ↓
Lib (clients, injectors) + Hooks
   ↓
Markdown Pipeline (unified plugins)
```

플러그인 ↔ 뷰어:
- 인터페이스 = HTTP. `/manifest.json`, `/content/<hash>/index.md`, `/content/<hash>/_assets/*`, `/__events`. 뷰어는 응답이 plugin 로컬 서버에서 오든 GH Pages 정적 파일에서 오든 모름 (URL 만 다름).

## 5.4 폴더 구조 (개발 디렉터리, 별도 위치)

```
notedrop/                                    ← 별도 개발 디렉터리 (TBD)
├── plugin/                                  ← 옵시디언 플러그인
│   ├── manifest.json                        ← Obsidian plugin 메타
│   ├── package.json
│   ├── esbuild.config.mjs
│   ├── tsconfig.json
│   ├── main.ts                              ← Plugin entry
│   ├── styles.css                           ← 옵시디언 UI CSS (notedrop- prefix)
│   └── src/
│       ├── settings/
│       │   ├── PluginSettings.ts            ← 타입 + default
│       │   └── SettingsTab.ts               ← UI
│       ├── commands/                        ← 각 명령어 1파일
│       ├── domain/                          ← 옵시디언 의존 0
│       │   ├── PublishIndex.ts
│       │   ├── ContentResolver.ts
│       │   ├── ContentTransformer.ts
│       │   ├── AssetCollector.ts
│       │   ├── BookAssembler.ts
│       │   ├── ManifestBuilder.ts
│       │   └── types.ts                     ← Reference, TransformedContent 등
│       ├── infrastructure/                  ← Adapters
│       │   ├── ObsidianVaultFs.ts
│       │   ├── ObsidianMetaCache.ts
│       │   ├── IsomorphicGitClient.ts
│       │   ├── LocalServer.ts
│       │   ├── GitPublisher.ts
│       │   └── VaultEventBridge.ts
│       ├── ports/                           ← Domain 이 요구하는 인터페이스
│       │   ├── VaultFs.ts
│       │   ├── MetaCache.ts
│       │   └── GitClient.ts
│       ├── testing/                         ← 테스트용 fake
│       │   ├── InMemoryVaultFs.ts
│       │   ├── FakeMetaCache.ts
│       │   └── FakeGitClient.ts
│       └── types.ts
└── viewer/                                  ← Next.js Static SPA
    ├── package.json
    ├── next.config.ts                       ← output: 'export'
    ├── tsconfig.json
    ├── public/                              ← 정적 자산
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx                     ← / (public list)
        │   └── [hash]/page.tsx              ← /<hash>
        ├── components/
        │   ├── viewer/                      ← BookViewer, DocViewer, Sidebar
        │   ├── markdown/                    ← extension React 컴포넌트
        │   ├── common/                      ← PageSizeSelector, DownloadPDFButton 등
        │   └── providers/                   ← LiveReloadProvider 등
        ├── lib/                             ← clients, injectors
        ├── hooks/                           ← 커스텀 훅
        ├── markdown-pipeline/               ← unified plugin 모음
        │   ├── remark-wikilink.ts
        │   ├── remark-obsidian-embed.ts
        │   ├── remark-callout.ts
        │   └── ...
        └── types/
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
| Viewer components | 자주 (UI 폴리시) | Internal |
