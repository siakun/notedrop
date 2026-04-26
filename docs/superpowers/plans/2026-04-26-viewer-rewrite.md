# Viewer 재작성 — Next.js + React + unified.js

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to execute this plan phase-by-phase. Phases use checkbox (`- [ ]`) syntax. Each phase ends with a commit + verification command.

**Goal:** spec §5.2 + §5.4 + §11.1.2 + ADR-0011 + ADR-0012 표준 복귀. 현재 vanilla JS + esbuild + marked + DOMPurify 로 구현된 viewer/ 를 Next.js (`output: 'export'` + `'use client'`) + React + TypeScript + unified.js pipeline + paged.js + KaTeX + Mermaid 로 재작성. spec §11.1.2 의 풀 기능 의무.

**Backup**: 기존 vanilla 코드는 `backup-vanilla-viewer` 브랜치 (origin) 에 보존 (HEAD = 1339cc9). 회복 필요 시 `git checkout backup-vanilla-viewer -- viewer/`.

**Macro 결정 (사용자 승인 명문화됨)**:
- ADR-0027 Accepted: publish = GitHub Tree API (GitClient port 유지, Adapter 만 GitHubPublisher) — 본 plan 과 독립
- ADR-0026 Rejected: vanilla viewer 폐기, spec §5.2 + ADR-0011 표준

---

## Spec references (코드 작성 전 통독 의무)

- `docs/05-building-blocks.md` §5.2 (viewer 컴포넌트 분해), §5.4 (폴더 구조)
- `docs/06-runtime-view.md` §6.4 (변환 파이프라인 — viewer 가 받는 markdown 형식 결정), §6.5 (캐시 전략), §6.6 (SSE 형식)
- `docs/11-mvp-and-roadmap.md` §11.1.2 (viewer 풀 기능 — 누락 없음 의무)
- `docs/decisions/0011-static-spa.md` (Next.js export + 'use client' 패턴)
- `docs/decisions/0012-hexagonal-unified.md` (unified.js pipeline)
- `docs/decisions/0008-렌더-3동작-tier.md` (HIDE/RENDER/PASSTHROUGH — 이미 ContentTransformer 가 처리, viewer 는 결과물 받음)
- `docs/decisions/0009-미발행-ref-안전장치.md` (안전장치 — 이미 ContentTransformer 가 HTML 로 변환)
- `docs/decisions/0016-페이지-사이즈-customcss.md` (5 프리셋 + customCss 격리)
- `docs/decisions/0017-자산-챕터별-분리.md` (자산 경로 — 이미 ContentTransformer 가 절대화)

## Spec 누락 — 본 plan 이 결정 (코드 리뷰 시 사용자 confirm)

### 1. ContentTransformer output 의 markdown 안에 HTML 섞임

`plugin/src/domain/ContentTransformer.ts` 현재 동작:
- 위키링크 → `[text](/notedrop/<slug-or-hash>)` (표준 markdown link, viewer 의 일반 link 처리 OK)
- 미발행 위키링크 → `<span class="notedrop-deadlink">...</span>` (HTML)
- 발행 임베드 → 본문 인라인 (재귀 변환된 markdown)
- 미발행 임베드 → `<div class="notedrop-embed-placeholder">...</div>` (HTML)
- 임베드 깊이 초과 → `<div class="notedrop-embed-overflow">...</div>` (HTML)
- 이미지 → `<img src="/content/<hash>/_assets/<basename>" ...>` (HTML)

**시사점**:
- viewer 의 unified pipeline 은 wikilink/embed/image **plugin 불필요**. ContentTransformer 가 이미 처리 완료.
- unified pipeline 의 remark-rehype 단계에서 `allowDangerousHtml: true` + `rehype-raw` 사용 의무 (HTML 패스스루). 안 하면 dead-link span/embed placeholder 가 텍스트로 새어나감.
- viewer 의 CSS 가 `.notedrop-deadlink`, `.notedrop-embed-placeholder`, `.notedrop-embed-overflow` 클래스 스타일 정의 의무.
- DOMPurify 쓸 거면 위 3 클래스 + `<img>` 허용 필요.

### 2. PageFrontmatter 직렬화 형식

ContentTransformer.transform() 반환의 outputFrontmatter 필드 (cover, customCss, render 등) 가 viewer 에 어떻게 전달되는가?

**현재 PreviewServer 응답** (`/content/<hash>/index.md`): `file.content` 만 (markdown body). frontmatter 직렬화 위치 미상.

**확인 필요 (P0 첫 작업)**: `plugin/src/domain/PublishOrchestrator.ts` 또는 publish 단계 코드 읽고 — content/<hash>/index.md 의 실제 형식 (`---\nyaml\n---\nbody` 인지 body-only 인지) 확인. 만약 body-only 면 PageFrontmatter 는 manifest.json 의 ManifestItem 에 머지하거나 별도 endpoint 추가 필요. **plan 으로 정확히 결정**.

### 3. Next.js dynamic route + `output: 'export'` 의 generateStaticParams 문제

Next.js 14+ `output: 'export'` 에서 `app/[hash]/page.tsx` 같은 dynamic route 는 빌드 시점에 모든 path 미리 생성 필요 (`generateStaticParams` 의무). 하지만 사용자 publish 마다 hash 가 변하므로 빌드 시점에 모름.

**3 옵션**:
- **A. Manifest-driven build**: `generateStaticParams` 가 빌드 시점에 `viewer/public/manifest.json` 읽어 모든 hash path 사전 생성. publish 마다 GH Actions 가 (a) Tree API push 후 (b) viewer 재빌드 trigger 의무. 단점: deploy 1~5분 추가.
- **B. Single page + URL 라우팅**: `app/page.tsx` 하나만, hash 또는 query string 으로 클라이언트 라우팅. dynamic route 안 씀. URL 형태: `https://siakun.github.io/notedrop/?hash=abc` 또는 `/#/abc`. ADR-0011 의 "/[hash]" path 명시 정신 위배 하지만 ADR-0011 본문 "라우팅: SPA 클라이언트 사이드" 와는 정합.
- **C. Hybrid**: `app/page.tsx` (홈) + `app/entry/page.tsx` (단일 entry 페이지, query string 으로 hash 받음). URL: `/notedrop/entry?hash=abc`. dynamic route 회피, path 직관성 약간 회복.

**plan 결정**: **옵션 A (manifest-driven build)** 채택. URL 미적·공유 가치 + ADR-0011 의 spec ref 정합. 단점은 publish flow 에서 GH Actions 재빌드 trigger 필요 — 본 plan 의 P7 (PreviewServer + esbuild + deploy.yml) 에서 같이 처리. publish (Tree API) 가 viewer/public/manifest.json 만 갱신하므로 deploy.yml trigger paths 에 `viewer/public/**` 추가하면 자동 재빌드.

대안 안 (B/C) 은 `generateStaticParams` 회피 가능하지만, ADR-0011 의 의도 (siakun.github.io 차용 = 깔끔한 URL) 위배. 사용자 확인 후 변경 가능.

### 4. paged.js 통합 패턴

paged.js 는 DOM 의 `<article class="pagedjs_pages">` 영역을 페이지 분할. SPA 라우팅 후 다시 호출 필요.

**plan 결정**:
- BookViewer / DocViewer 컴포넌트가 `useEffect` 로 paged.js Previewer 인스턴스 생성, 콘텐츠 변경 시 cleanup + 재생성.
- paged.js 의 동적 import (`import('pagedjs')`) 로 SSR 호환 (Next.js export 라도 빌드 시 SSR 가능성). 안 하면 `window` undefined 에러.

### 5. Mermaid 통합

`rehype-mermaid` 는 빌드 타임 SVG 렌더 (puppeteer 또는 playwright 의존). 클라이언트 SPA 와 부적합.

**plan 결정**: **클라이언트 직접 import**. unified pipeline 에서는 ` ```mermaid ` 코드블록을 그대로 두고 (혹은 `<pre class="mermaid">` 변환), MarkdownRenderer 컴포넌트가 `useEffect` 에서 `mermaid.run()` 호출. SSR 회피 위해 dynamic import.

### 6. KaTeX 통합

`rehype-katex` 사용. 빌드 타임 + 클라이언트 양쪽 OK. 산출물 안에 KaTeX CSS 임포트 의무 (`katex/dist/katex.min.css`).

### 7. customCss sanitize

ContentTransformer 의 `sanitizeCss()` 가 이미 `@import` / `url(http*)` / `expression()` strip. viewer 는 받은 customCss 를 추가 sanitize 없이 `<style data-page-hash="...">` 주입 + 페이지 떠날 때 제거. 격리 prefix `.notedrop-content` 자동 부여는 viewer 의 cssInjector 책임.

### 8. 라이브 reload (SSE)

PreviewServer 의 SSE 형식 (06-runtime-view §6.6):
```
event: changed
data: {"hash":"aB3xK9"}
```

LiveReloadProvider 가 dev 환경 (= localhost:4321) 에서만 EventSource 연결. prod (GH Pages) 는 try-catch 로 silently 실패. 환경 판정: `window.location.hostname === '127.0.0.1' || === 'localhost'`.

---

## Phase 분할

각 phase 는 (1) 코드 작성, (2) 단위 테스트 (가능한 한도), (3) 검증 명령, (4) commit 1+개. main 의 빌드 가능 상태는 P7 끝까지 깨질 수 있음 (P0~P6 진행 동안 plugin/src/embedded/ 가 stale 상태). 안전 commit boundary 는 P7 종료 시점.

| Phase | Tasks | 산출물 | main 작동 |
|---|---|---|---|
| **P0. 사전 조사** | 1 | content/<hash>/index.md 직렬화 형식 결정, ADR-0028 (필요 시) | OK (코드 변경 없음) |
| **P1. 스캐폴드** | 4 | viewer/{package.json, next.config.ts, tsconfig.json, .gitignore}, 기본 폴더 구조 | 깨짐 (vanilla 제거) |
| **P2. lib + hooks + types** | 5 | manifestClient, contentClient, paginationConfig, useManifest, useContent, types/ | 깨짐 |
| **P3. markdown pipeline** | 6 | unified pipeline, 자체 plugin (remark-callout, remark-highlight), KaTeX, Mermaid | 깨짐 |
| **P4. components/markdown** | 4 | MarkdownRenderer, Callout/Highlight/Footnote/Task/BlockId 컴포넌트 | 깨짐 |
| **P5. components/viewer + common** | 6 | BookViewer + DocViewer (paged.js), Sidebar, PageSizeSelector, DownloadPDFButton, 표지 | 깨짐 |
| **P6. providers** | 3 | LiveReloadProvider (SSE), PageSizeProvider (localStorage), ThemeProvider | 깨짐 |
| **P7. 통합 (PreviewServer + esbuild + deploy.yml)** | 5 | esbuild embedViewerAssets() Next.js out/ 대응, PreviewServer Next.js export 산출물 서빙, deploy.yml 신규 작성, viewer/build.mjs 삭제 | **OK 회복** |
| **P8. 검증 + dogfood 준비** | 3 | viewer 단위 테스트, 통합 빌드, README 갱신 | OK |

총 37 tasks. 본 plan 의 main 작동 가능 commit boundary 는 P0 끝 + P7 끝 (+ P8). P1~P6 는 work-in-progress, 다음 phase 가 이어지지 않으면 main 깨진 상태로 잠.

**완화책**: P1~P6 동안 임시로 vanilla 산출물을 plugin/src/embedded/ 에 그대로 두고 (P1 에서도 viewer/dist/ 보존), P7 에서만 swap. 즉 P1 이 viewer/src/ 만 교체, viewer/dist/ + plugin/src/embedded/ 는 P7 까지 유지. BRAT 사용자가 받는 plugin = vanilla 그대로 작동. dogfood 진행에 막힘 0.

---

## P0. 사전 조사 (2026-04-26 viewer 리팩토링 세션에서 완료)

### Task P0.1 — content/<hash>/index.md 직렬화 형식 확정 ✅ 완료

`plugin/src/domain/PublishOrchestrator.ts` line 47~52 + `plugin/src/infrastructure/PreviewServer.ts` line 159~173 + `plugin/src/infrastructure/GitHubPublisher.ts` 코드 검증 결과:

**확정 형식** (publish + PreviewServer 양쪽 동일):
```
---
<PageFrontmatter YAML, key: value 라인 형식>
---

<HTML 섞인 markdown body>
```

- PublishOrchestrator.plan() 가 `serializeFrontmatter(transformed.outputFrontmatter)` 로 YAML 직렬화 후 `---\n${yaml}---\n\n${markdown}` 합침.
- PreviewServer 의 `/content/<hash>/index.md` 가 동일 file.content 그대로 응답.
- GitHubPublisher 가 동일 file.content 그대로 blob 생성.

**PageFrontmatter 도착 필드** (`plugin/src/types.ts` 정의):
- `hash`, `slug`, `title`, `render` ('book' | 'doc'), `type` ('entry' | 'chapter'), `parent`, `order`, `cover`, `customCss`, `publishedAt`, `updatedAt`
- `cover` 는 이미 절대 경로 (`/content/<hash>/_assets/<basename>`) 로 와 있음
- `customCss` 는 이미 sanitize 된 raw CSS 문자열로 와 있음 (cssInjector 가 추가 sanitize 불필요)

**결정**: 시나리오 A (frontmatter 포함) 채택. ADR-0028 **작성 불필요** — 결정은 현재 코드가 이미 명문화됨, spec §6.4 의 "HTTP 응답 (frontmatter + markdown 합친 .md 형식)" 와 정합.

**시사점**:
- viewer 의 lib/contentClient.ts 는 frontmatter 파싱 의무 (`gray-matter` 의존 추가 또는 자체 파서 — 형식 단순하니 자체 권장, 의존 1개 절감).
- viewer 의 lib/manifestClient.ts 는 ManifestItem (cover, customCss 미포함) 만 받음. 페이지별 customCss/cover 는 contentClient 에서 받는 PageFrontmatter 사용.
- BookViewer 가 entry hash 의 PageFrontmatter.cover 사용 (entry 의 cover 가 책 표지). chapter 의 cover 는 일반적으로 null.

**Verification**: 위 분석을 본 plan 의 P2.3 (contentClient) + P5.2 (BookViewer) task 가 그대로 구현 가능. PageFrontmatter 의 모든 필드가 viewer 에 도달.

**Commit**: 본 세션이 plan 갱신과 함께 한 commit 으로 처리. ADR 없음.

---

## P1. 스캐폴드

### Task P1.1 — viewer/package.json 작성

의존:
- runtime: `next@^14`, `react@^18`, `react-dom@^18`, `unified`, `remark-parse`, `remark-gfm`, `remark-math`, `remark-rehype`, `rehype-raw`, `rehype-katex`, `rehype-react`, `katex`, `mermaid`, `pagedjs`, `gray-matter` (P0 시나리오 A 시)
- dev: `typescript`, `@types/react`, `@types/react-dom`, `@types/node`, `eslint`, `eslint-config-next`, `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `jsdom`

scripts: `dev`, `build` (= `next build`), `lint`, `test`, `typecheck`

```json
{
  "name": "notedrop-viewer",
  "version": "0.1.25",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

### Task P1.2 — viewer/next.config.ts

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'export',
  basePath: process.env.NODE_ENV === 'production' ? '/notedrop' : '',
  trailingSlash: true,
  images: { unoptimized: true } // export 호환
}
export default config
```

GH Pages basePath = `/notedrop`. PreviewServer (localhost) 는 `/`. 환경 변수 분기.

### Task P1.3 — viewer/tsconfig.json

Next.js 14 표준 + strict + paths alias `@/*` → `src/*`.

### Task P1.4 — viewer/.gitignore + 폴더 구조

```
.next/
out/
node_modules/
*.tsbuildinfo
.env.local
```

폴더 (빈 파일 또는 README placeholder):
- `viewer/src/app/{layout.tsx, page.tsx, [hash]/page.tsx}`
- `viewer/src/components/{viewer/, markdown/, common/, providers/}`
- `viewer/src/lib/`
- `viewer/src/hooks/`
- `viewer/src/markdown-pipeline/`
- `viewer/src/types/`
- `viewer/public/`
- `viewer/tests/` (또는 각 모듈 옆 *.test.ts)

**Verification**: `cd viewer && npm install && npm run typecheck && npm run build` 성공 (빈 page 라도). `out/` 디렉터리 생성 확인.

**완화책 적용**: 기존 viewer/dist/ 는 P7 까지 보존 (gitignore 안 변경). plugin/src/embedded/ stale 한 vanilla 자산 유지.

**Commit**: `🔧 chore(viewer): Next.js + TS + unified.js 의존 스캐폴드`

---

## P2. lib + hooks + types

### Task P2.1 — types/manifest.ts + types/content.ts

`plugin/src/types.ts` 의 Manifest, ManifestItem, PageFrontmatter, RenderMode, ItemType 를 그대로 옮김 (cross-boundary 안정 타입). 향후 plugin 변경 시 여기도 동기화 — manifest version bump 시 viewer 테스트도 갱신 의무.

### Task P2.2 — lib/manifestClient.ts

`fetch('/manifest.json')` + 메모리 캐시 (한 번 받으면 SSE invalidation 까지 보존). 환경별 base URL 자동 (basePath 처리는 Next.js 가).

```ts
let cached: Manifest | null = null
export async function getManifest(): Promise<Manifest> {
  if (cached) return cached
  const res = await fetch('/manifest.json')
  cached = await res.json()
  return cached
}
export function invalidateManifest() { cached = null }
```

### Task P2.3 — lib/contentClient.ts

`fetch('/content/<hash>/index.md')` + per-hash 캐시. P0 결정 시나리오에 따라 frontmatter 파싱 포함/제외.

### Task P2.4 — lib/cssInjector.ts

`<style data-page-hash="...">` 주입·제거 + `.notedrop-content` 자동 prefix.

```ts
export function injectPageCss(hash: string, css: string): void { ... }
export function removePageCss(hash: string): void { ... }
function prefixSelectors(css: string): string { ... } // best-effort scoping
```

### Task P2.5 — lib/paginationConfig.ts + hooks (useManifest, useContent, usePageSize)

5 사이즈 프리셋 (A3/A4/A5/B5/B6) → paged.js `@page { size: ... }` + 폰트/여백 매핑.

```ts
export const PAGE_SIZES = {
  A3: { width: '297mm', height: '420mm', fontSize: '14pt', margin: '20mm' },
  A4: { width: '210mm', height: '297mm', fontSize: '12pt', margin: '18mm' },
  // ...
}
```

Hooks:
- `useManifest()` — getManifest() + SSE 시 invalidate + 재요청. SWR 패턴 자체 구현 (의존 추가 회피).
- `useContent(hash)` — 동일.
- `usePageSize()` — localStorage + 상태.

**Verification**: hooks 단위 테스트 (jsdom + @testing-library/react). manifestClient 캐시 동작 + invalidate 동작 + 동시 요청 합치기.

**Commit**: `✨ feat(viewer): manifest/content client + page size + hooks`

---

## P3. markdown pipeline

### Task P3.1 — markdown-pipeline/index.ts

unified pipeline 조립 함수. P0 시사점 적용 (HTML 패스스루):

```ts
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkCallout from './remark-callout'
import remarkHighlight from './remark-highlight'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeReact from 'rehype-react'

export const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkCallout)
  .use(remarkHighlight)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeKatex)
  .use(rehypeReact, { /* React mapping */ })
```

### Task P3.2 — markdown-pipeline/remark-callout.ts

`> [!info] Title\n> body` 형식 → `<div class="callout callout-info"><div class="callout-title">Title</div><div class="callout-body">body</div></div>` mdast 변환.

지원 type: info, warning, success, danger, note, tip, todo, important, question, example, quote, abstract, failure, error, bug, cite (옵시디언 코어).

단위 테스트: 각 type, title 있음/없음, 다중 라인, 중첩.

### Task P3.3 — markdown-pipeline/remark-highlight.ts

`==text==` → `<mark>text</mark>` mdast 변환. 단위 테스트: 단일/다중, escape, code 안에선 변환 X.

### Task P3.4 — markdown-pipeline/remark-footnote.ts (or use remark-gfm 의 footnote)

remark-gfm 이 footnote 지원 — 별도 plugin 불필요. 확인 후 없으면 작성.

### Task P3.5 — markdown-pipeline/rehype-mermaid-client.ts

` ```mermaid ` 코드블록 → `<pre class="mermaid" data-source="...">...</pre>`. 클라이언트 측 mermaid.run() 이 처리.

### Task P3.6 — markdown-pipeline/types.ts + 단위 테스트

processor 의 input → output 통합 테스트. 픽스처 markdown 여러 케이스.

**Verification**: `cd viewer && npm test` 모든 테스트 통과.

**Commit**: `✨ feat(viewer): unified pipeline + remark plugin (callout, highlight, mermaid)`

---

## P4. components/markdown

### Task P4.1 — components/markdown/Callout.tsx

rehype-react mapping 으로 `<div class="callout">` → React 컴포넌트. 아이콘 + 색 5종 (info=파랑, warning=노랑, danger=빨강, success=초록, neutral=회색).

### Task P4.2 — components/markdown/MathBlock.tsx + MermaidBlock.tsx

KaTeX 는 rehype-katex 가 빌드 타임 KaTeX HTML 생성 — 컴포넌트는 className 만 매핑. CSS import 필수.

Mermaid 는 useEffect 에서 mermaid.run() 호출. dynamic import (SSR 회피).

### Task P4.3 — components/markdown/{DeadLink,EmbedPlaceholder,EmbedOverflow}.tsx

ContentTransformer 가 만든 HTML 클래스에 대응. 단순 styled component.

### Task P4.4 — components/markdown/MarkdownRenderer.tsx (호스트)

processor 호출 → React 트리 반환. customCss 주입 (page 진입 시) + 제거 (떠날 때) — useEffect cleanup.

**Verification**: 각 컴포넌트 storybook 또는 단위 테스트 (RTL).

**Commit**: `✨ feat(viewer): markdown 컴포넌트 (Callout/Math/Mermaid/DeadLink/Renderer)`

---

## P5. components/viewer + common

### Task P5.1 — components/viewer/DocViewer.tsx

paged.js Previewer 인스턴스 + 단일 `<MarkdownRenderer>`. useEffect 로 `previewer.preview(html, [stylesheets], element)`.

### Task P5.2 — components/viewer/BookViewer.tsx + Sidebar.tsx

manifest 의 ManifestItem.chapters 배열 따라 모든 chapter 의 content 를 fetch (병렬) + concat → paged.js. 표지 (notedrop-cover) 가 있으면 첫 페이지로.

Sidebar = chapter title 리스트 + 클릭 시 anchor scroll.

### Task P5.3 — components/common/PageSizeSelector.tsx

5 사이즈 dropdown. 우상단 fixed. usePageSize() hook.

### Task P5.4 — components/common/DownloadPDFButton.tsx

`window.print()` 호출. paged.js 가 렌더한 페이지가 그대로 인쇄.

### Task P5.5 — components/common/ThemeToggle.tsx (보류)

Light only (spec §11.1.2). v2 toggle. 본 plan 에서는 Light 기본.

### Task P5.6 — app/layout.tsx + app/page.tsx + app/[hash]/page.tsx

- `layout.tsx`: 글로벌 CSS (KaTeX, paged.js base) + Provider 래핑
- `page.tsx`: ManifestItem.type === 'entry' 만 표시 (homepage)
- `[hash]/page.tsx`: 'use client' + useContent(params.hash) + render === 'book' 분기 → BookViewer / DocViewer
- `generateStaticParams`: 빌드 시 `viewer/public/manifest.json` 읽고 모든 hash 반환

**Verification**: 부트스트랩 manifest (welcome) 로 `cd viewer && npm run build` 성공 + `out/` 안 `welcome/index.html` 생성 확인. 브라우저에서 `npx serve out` → 홈 + 단일 entry 표시.

**Commit**: `✨ feat(viewer): BookViewer/DocViewer/Sidebar/PageSize/DownloadPDF + 라우팅`

---

## P6. providers

### Task P6.1 — providers/LiveReloadProvider.tsx

```tsx
'use client'
useEffect(() => {
  const isLocal = ['127.0.0.1', 'localhost'].includes(location.hostname)
  if (!isLocal) return
  try {
    const sse = new EventSource('/events')
    sse.addEventListener('changed', (e) => {
      const { hash } = JSON.parse(e.data)
      invalidateManifest()
      invalidateContent(hash)
    })
    sse.addEventListener('removed', ...)
    return () => sse.close()
  } catch {}
}, [])
```

### Task P6.2 — providers/PageSizeProvider.tsx

usePageSize hook 의 Provider 형태 (Context). page 컴포넌트가 useContext 로 사이즈 받음.

### Task P6.3 — providers/ThemeProvider.tsx

light 고정 (v2 까지). data-theme="light" 적용.

**Verification**: `cd viewer && npm run dev` 띄우고 PreviewServer (별도 터미널) 와 통신 확인 — manifest GET, SSE 'hello' event 수신.

**Commit**: `✨ feat(viewer): LiveReload + PageSize + Theme provider`

---

## P7. 통합 (PreviewServer + esbuild + deploy.yml)

⚠️ 이 phase 끝 시점이 main 작동 회복 boundary.

### Task P7.1 — viewer/build.mjs 삭제 + 의존 검사

vanilla 빌드 스크립트 삭제. package.json 의 `build` 가 `next build`. 이후 viewer/dist/ 는 더이상 생성 안 되고 viewer/out/ 가 산출물.

### Task P7.2 — plugin/esbuild.config.mjs 의 embedViewerAssets() 갱신

`viewer/dist/{index.html, app.js, style.css}` 3 파일 → `viewer/out/` 의 Next.js export 산출물.

Next.js export 의 산출물 구조:
```
viewer/out/
├── index.html              ← homepage
├── _next/                  ← JS chunks + CSS
│   ├── static/chunks/*.js
│   └── static/css/*.css
├── <hash>/index.html       ← per-hash pre-rendered (generateStaticParams 결과)
└── content/                ← public/content/ 그대로 복사
```

PreviewServer 가 `_next/` 경로도 서빙해야 함. 즉 자산 인라인 패턴 한계 (수십 파일).

**3 옵션**:
- **A. 전부 인라인**: out/ 안의 모든 파일을 string 으로 plugin/src/embedded/ 로 복사. 파일 수십 개라 esbuild import 패턴 복잡 + main.js 비대.
- **B. 디렉터리 전체 인라인**: tar/zip 으로 압축 후 string base64 → PreviewServer 시작 시 메모리에 풀어 `Map<path, content>` 로 두고 서빙.
- **C. 실제 파일 시스템 서빙**: plugin 이 viewer/out/ 디렉터리를 ZIP 로 묶어 plugin 의 .obsidian/plugins/notedrop/ 안에 배치. PreviewServer 가 서빙 시 fs.readFile.

**plan 결정**: **옵션 B (디렉터리 인라인 + 메모리 unzip)**. 이유:
- 옵션 A 는 파일 수가 가변 (chunk 이름 hash) 이라 빌드마다 import 선언 달라짐 → esbuild import 안 됨.
- 옵션 C 는 plugin 디렉터리 사이드카 도입 (ADR-0018 정신 위배).
- 옵션 B 는 단일 string 자산, 메모리 부담 ~수백 KB (out/ 압축 후), unzip 의존 추가 (`fflate` ~30KB) 만으로 해결.

esbuild 갱신:
1. `embedViewerAssets()` 가 viewer/out/ 디렉터리를 fflate.zipSync 로 압축 → `plugin/src/embedded/viewer.zip.b64` 로 base64 저장
2. esbuild loader: `.b64` → `text`
3. PreviewServer 가 import 시 base64 → Uint8Array → fflate.unzipSync → `Map<path, Uint8Array>` 메모리 보존
4. `handle()` 가 path 기반 lookup, mime 추론

### Task P7.3 — PreviewServer.ts 갱신

위 옵션 B 적용:
- 시작 시 zip unpack
- `/`, `/<hash>/`, `/_next/static/...` 모두 unpacked map 에서 lookup
- 기존 `/manifest.json`, `/content/<hash>/index.md`, `/content/<hash>/_assets/<basename>`, `/events` 라우트는 동적 (orchestrator + index 사용) 유지

### Task P7.4 — .github/workflows/deploy.yml 신규 작성

⚠️ 현재 repo 에 deploy.yml **없음** (release.yml 만). 메모리/이전 핸드오프가 deploy.yml 존재 가정한 부분 부정확. 신규 작성.

```yaml
name: deploy viewer to GH Pages
on:
  push:
    branches: [main]
    paths: ['viewer/**', '!viewer/dist/**']
  workflow_dispatch:
permissions:
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: viewer/package-lock.json }
      - run: npm ci
        working-directory: viewer
      - run: npm run build
        working-directory: viewer
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with: { path: viewer/out }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

### Task P7.5 — 통합 빌드 검증

```bash
cd viewer && npm install && npm run build  # → viewer/out/ 생성
cd ../plugin && npm install && npm run build  # → main.js + embedded zip 갱신
cd plugin && npm test && npm run typecheck  # 회귀 0
```

PreviewServer 단위 테스트도 갱신 (zip unpack mock 필요할 수 있음).

**Verification**: 
- `cd viewer && npm run build` → out/ 생성
- `cd plugin && npm run build` → main.js 안에 viewer.zip.b64 인라인 확인 (grep "data:" or 파일 크기 증가)
- `cd plugin && npm test` 모두 통과
- 옵시디언 dev vault 에 plugin 로드 → "Start preview" → 브라우저에서 새 viewer 표시

**Commit (1+개)**: 
- `🔥 chore(viewer): vanilla build.mjs 삭제`
- `✨ feat(plugin): viewer.zip 인라인 + PreviewServer Next.js out/ 서빙`
- `🚀 ci(deploy): viewer GH Pages 배포 workflow 신규`

---

## P8. 검증 + dogfood 준비

### Task P8.1 — viewer 단위 테스트 통과 (가능한 한도)

P3 markdown plugin 테스트 + P2 client/hook 테스트 + P4/P5 컴포넌트 RTL. 커버리지 목표 70%+ (vanilla 시절 0%).

### Task P8.2 — README.md 갱신

vanilla → Next.js + React + unified.js 변경 반영. 빌드 명령, 의존, dev workflow.

### Task P8.3 — manifest version bump 검토

manifest version = 1 유지 (스키마 변경 없음). 단 PageFrontmatter 의 customCss 가 viewer 에 도달하는 경로 (P0 결정) 가 schema 영향 시 version=2 + plugin 마이그레이션.

**Verification**: 사용자가 dogfood (BRAT update + publish 1회 + URL 확인) → 기능 회귀 없음.

**Commit**: `✅ test(viewer): 통합 테스트 + README 갱신 + dogfood 준비`

---

## 알려진 함정

1. **Next.js `output: 'export'` + dynamic route 의 generateStaticParams**: 빌드 시점에 manifest 가 비어있으면 ([] 반환) homepage 만 생성. 첫 publish 후 deploy.yml 가 viewer 재빌드 → `<hash>/index.html` 생성. 첫 publish 전엔 `/<hash>` 접근 시 404 — 의도된 동작 (entry 없음).

2. **paged.js + Next.js SSR**: `pagedjs` 가 `window` 의존. `'use client'` + dynamic import 필수. SSR 시 placeholder 반환.

3. **Mermaid + dynamic import**: 클라이언트 측 `mermaid.run()` 가 페이지 진입 시 1회 + SSE 갱신 시 다시. cleanup (`mermaid` 가 SVG 직접 DOM 수정) 시 중복 방지 로직 필요.

4. **rehype-react 의 typing**: rehype-react 의 React 매핑 타입이 react@18 과 약간 mismatch. types/index.d.ts 패치 또는 cast 필요.

5. **basePath 환경 분기**: Next.js 의 basePath 가 prod 만 `/notedrop`. localhost (PreviewServer) 는 `/`. fetch URL 도 환경에 맞게 — Next.js 자동 처리되지만 manifest/content client 가 절대 path 쓰면 깨짐. **상대 path 또는 `useRouter().basePath` 사용 필수**.

6. **viewer.zip 사이즈**: out/ 압축 후 ~수백 KB 예상. main.js 안에 base64 (4/3 배 팽창) → ~MB. release.yml 의 main.js asset 사이즈 초과 시 Tree API blob 5MB 한계 의식.

7. **fflate import**: ES 모듈, esbuild bundle 시 cjs target 호환. 안 되면 `pako` 폴백.

8. **localStorage 의 페이지 사이즈**: SSR 시 undefined. usePageSize 가 useEffect 안에서 read 의무.

---

## main 작동 가능 commit boundary

- ✅ P0 끝 (코드 변경 없음)
- ❌ P1~P6 (vanilla 산출물 보존 정책 적용 시 plugin/main.js 가 vanilla viewer 임베드 — viewer/src 변경에도 plugin 빌드 OK 가정)
- ✅ P7 끝 (Next.js viewer 완전 통합)
- ✅ P8 끝

P1~P6 동안 사용자가 main 을 BRAT 으로 update 받아도 vanilla viewer 작동 (embedded zip 이 vanilla 자산 그대로). 안전.

## 시작 명령 (다음 세션)

본 plan 따라 P0 부터. 핸드오프 (`docs/superpowers/handoffs/2026-04-26-viewer-rewrite-session-start.md`) 전부 입력 후:

> Plan `docs/superpowers/plans/2026-04-26-viewer-rewrite.md` P0 부터 진행. P0 끝 commit, P1~P6 phase 단위 commit, P7 에서 main 회복, P8 dogfood. Auto mode 가정. push 시점 (P7 끝, P8 끝) 사용자 승인.
