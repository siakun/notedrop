---
date: 2026-04-26
type: 핸드오프
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - viewer-rewrite
  - completion
  - handoff
summary: viewer = Next.js + React + unified.js 재작성 P1~P7 완료. main 작동 회복 boundary 도달. 다음 세션은 P8 dogfood 검증 + (필요 시) v0.1.25 release
---

# Notedrop viewer 재작성 완료 핸드오프

새 Claude Code 세션 첫 입력으로 전체 붙여넣기.

---

## 0. 한눈에

| 항목 | 상태 |
|---|---|
| viewer 재작성 | **완료** (Next.js 14 + React 18 + TS strict + unified.js + paged.js + KaTeX + Mermaid) |
| plugin 통합 | **완료** (esbuild zip 인라인 + PreviewServer unzip 서빙) |
| deploy.yml | **완료** (신규 작성, viewer/** trigger) |
| 빌드 검증 | **완료** (viewer next build + plugin esbuild + 211 단위 테스트) |
| 옵시디언 GUI dogfood | **미완** (실 환경 필요, 사용자 단계) |
| v0.1.25 release tag | **미완** (dogfood 후) |

본 세션 main HEAD 4 commit ahead origin/main:
- (이전 세션) `6fe56b6` 0026/0027 강등 명문화
- `66f286e` ADR Accept/Reject 명문화
- `1339cc9` vanilla 마지막 주석 (backup)
- `a040891` viewer 재작성 plan + 다음 세션 핸드오프
- `4450066` ✨ feat(viewer): Next.js + React + unified.js 재작성 (P1~P6)
- `95f46b8` ✨ feat(plugin): viewer 자산 zip 인라인 + deploy.yml + PreviewServer 갱신 (P7)
- (본 commit) 📝 docs: README + 핸드오프 + 메모리 갱신 (viewer Next.js 회복)

backup 브랜치: `backup-vanilla-viewer` (origin push 됨, vanilla viewer HEAD = 1339cc9 + 그 이전 커밋들)

## 1. 다음 세션 범위 = P8 dogfood

### Task 1.1 — 옵시디언에 plugin 로드

1. main 이 push 된 상태에서 `git tag 0.1.25-rc1 && git push origin 0.1.25-rc1`
2. release.yml 가 자동으로 viewer + plugin 빌드 → release asset 업로드
3. BRAT 으로 `0.1.25-rc1` 또는 latest 받음
4. Settings → Notedrop 활성화 → 콘솔 `notedrop loaded`

### Task 1.2 — preview server 작동 확인

1. Cmd+P → `Notedrop: Start preview server`
2. 브라우저 `http://127.0.0.1:4321/` → 새 Next.js viewer 표시 (welcome 페이지)
3. 헤더 `notedrop` + 페이지 사이즈 selector + ☀ + entry list 카드 1개 (welcome)
4. welcome 카드 클릭 → /welcome/ 진입 + paged.js 분할 본문
5. 우하단 LIVE 뱃지 (초록)
6. vault 의 발행 노트 변경 → 갱신 뱃지 (파랑) → 자동 reload

### Task 1.3 — 마크다운 풀 기능 검증

vault 에 다음 패턴 노트 작성 + `notedrop-publish: true`:
- 위키링크 (발행 + 미발행)
- 임베드 (발행 + 미발행)
- 콜아웃 5종 (info/warning/danger/success/note)
- 하이라이트 ==text==
- 수식 $E=mc^2$ + $$\sum$$ 블록
- Mermaid graph
- 이미지 (vault 안의 png) + 사이즈 ![[img.png|400]]
- 풋노트, 블록 ID, 태스크
- frontmatter `notedrop-css: ...` 또는 `notedrop-css-file:`
- frontmatter `notedrop-cover:` (책 표지)

각 케이스가 Next.js viewer 에서 정확히 렌더되는지 확인.

### Task 1.4 — 발견 시 patch fix

dogfood 중 발견 버그는 `🐛 fix(viewer)` 또는 `🐛 fix(plugin)` commit 후 patch (0.1.25, 0.1.26, ...) 또는 minor (0.2.0).

### Task 1.5 — release tag

dogfood 통과 시:
1. `manifest.json`, `plugin/package.json`, `viewer/package.json` 모두 0.1.25 (또는 dogfood 결과 0.2.0) 일치
2. `git tag 0.1.25 && git push origin 0.1.25`
3. release.yml + deploy.yml 자동 trigger 확인
4. BRAT 사용자 update 받음

## 2. 본 세션 산출물 목록

### viewer/ 새 구조 (Next.js + React)

```
viewer/
├── package.json            (next 14.2, react 18, ts 5, unified 11, paged.js, katex, mermaid, fflate X)
├── next.config.mjs         (output:'export', basePath /notedrop in prod)
├── tsconfig.json           (strict + paths @/* → src/*)
├── .gitignore              (.next/, out/, node_modules/)
├── public/                 (manifest.json + content/welcome/index.md, 부트스트랩)
└── src/
    ├── app/
    │   ├── layout.tsx                (RootLayout + KaTeX CSS + globals.css)
    │   ├── globals.css               (CSS 변수 + callout/sidebar/live-badge/print 스타일)
    │   ├── page.tsx                  (/ → HomeClient)
    │   └── [hash]/page.tsx           (/<hash> → EntryClient + generateStaticParams = manifest.items)
    ├── components/
    │   ├── viewer/
    │   │   ├── HomeClient.tsx        (entry list 카드)
    │   │   ├── EntryClient.tsx       (book/doc 분기 + LiveReload + header)
    │   │   ├── BookViewer.tsx        (manifest.chapters 병렬 fetch + 표지 + sidebar)
    │   │   ├── DocViewer.tsx         (paged.js dynamic import + page CSS)
    │   │   └── Sidebar.tsx           (TOC + 활성 챕터)
    │   ├── markdown/
    │   │   ├── MarkdownRenderer.tsx  (호스트, async render + customCss 주입)
    │   │   ├── Callout.tsx           (icon + variant 색 + fold)
    │   │   ├── MermaidBlock.tsx      (dynamic mermaid + useEffect.run)
    │   │   ├── DeadLink.tsx
    │   │   └── EmbedPlaceholder.tsx  (+ EmbedOverflow)
    │   ├── common/
    │   │   ├── PageSizeSelector.tsx
    │   │   ├── DownloadPDFButton.tsx (window.print)
    │   │   └── ThemeToggle.tsx       (light 고정, v2 toggle)
    │   └── providers/
    │       └── LiveReloadProvider.tsx (SSE /events, dev 환경 분기)
    ├── lib/
    │   ├── basePath.ts               (NEXT_PUBLIC_BASE_PATH 환경 분기)
    │   ├── manifestClient.ts         (메모리 캐시 + invalidate + subscribe)
    │   ├── contentClient.ts          (자체 frontmatter 파서, gray-matter 의존 X)
    │   ├── cssInjector.ts            (.notedrop-content scoping + 격리)
    │   └── paginationConfig.ts       (5 사이즈 프리셋 + pageSizeCss())
    ├── hooks/
    │   ├── useManifest.ts
    │   ├── useContent.ts
    │   └── usePageSize.ts
    ├── markdown-pipeline/
    │   ├── index.ts                  (unified processor 빌더)
    │   ├── react-components.tsx      (rehype-react Components 매핑)
    │   ├── callout-types.ts          (25 alias → 13 variant + 한국어 기본 title)
    │   ├── remark-callout.ts         (자체)
    │   ├── remark-highlight.ts       (자체, ==text==)
    │   └── remark-mermaid.ts         (자체, ```mermaid → pre.mermaid)
    └── types/
        ├── manifest.ts
        ├── content.ts
        └── pagedjs.d.ts              (declare module)
```

### plugin/ 변경

- `plugin/package.json`: fflate ^0.8.2 의존 추가
- `plugin/src/types/embedded-assets.d.ts`: `*.b64` 모듈 선언 추가
- `plugin/esbuild.config.mjs`: embedViewerAssets() 가 viewer/dist 3 파일 → viewer/out/ 재귀 zip → viewer.zip.b64
- `plugin/src/infrastructure/PreviewServer.ts`: 시작 시 zip unpack + path lookup 폴백 (동적 라우트 우선)

### `.github/workflows/deploy.yml`

신규. viewer/** 변경 trigger, next build → upload-pages-artifact → deploy-pages.

### docs/

- ADR-0026 Status Rejected
- ADR-0027 Status Accepted
- plan: docs/superpowers/plans/2026-04-26-viewer-rewrite.md (P0~P8)
- 핸드오프 신규 (본 파일)

## 3. 발견·결정 (다음 세션 참고)

### 3.1 main.js 사이즈 7.4MB

vanilla 시절 ~200KB → Next.js + React + KaTeX + Mermaid 자산 zip 인라인 → 7.4MB. BRAT 다운로드만 한 번. plugin load 시 메모리는 zip unpack 한 메모리 (~수MB) + chunks. dogfood 에서 옵시디언 시작 시간 부담 측정 필요.

### 3.2 paged.js 통합 패턴

DocViewer + BookViewer 가 source 를 hidden div 로 hydration 후 paged.js Previewer.preview() 호출 + target 에 분할된 .pagedjs_pages 존재. paged.js 미로드 시 source clone 폴백.

함정: paged.js 가 source 의 mermaid SVG 까지 분할. 즉 mermaid 가 useEffect 로 SVG 박기 → paged.js 분할 순서 race. 50ms timeout 으로 어림 처리 (DocViewer.tsx). dogfood 에서 race 발견 시 explicit ordering 필요.

### 3.3 Next.js dynamic route + export

`[hash]/page.tsx` 의 `generateStaticParams` 가 빌드 시 `viewer/public/manifest.json` 읽음. 즉 publish 가 viewer/public/manifest.json 갱신 → deploy.yml trigger → next build 가 새 hash 의 페이지 사전 생성 → out/<hash>/index.html. 첫 publish 전엔 welcome 만 사전 생성.

함정: deploy.yml 의 paths trigger 가 `viewer/**` 인데 publish 가 main 브랜치에 새 manifest commit 하면 viewer/public/manifest.json 변경 → trigger 됨. 단 `viewer/dist/**` 는 제외 (vanilla 잔재 없도록).

근데 publish 가 public 레포의 viewer/public/manifest.json 갱신 (Tree API 의 base_tree). 본 repo (siakun/notedrop) 의 viewer/public/manifest.json 은 부트스트랩 (welcome) 그대로. 즉 본 repo 는 viewer 코드 변경 시만 deploy.yml trigger. publish 후 GH Pages 갱신은 publish 대상 repo 가 자체 deploy.yml 가져야 함 — **본 repo 가 publish 대상이 같으면 자동, 다르면 사용자가 publish 대상 repo 에도 deploy.yml 복사 필요**.

본 세션 가정: publish 대상 = 본 repo (siakun/notedrop). dogfood 에서 deploy.yml 가 publish 후 자동 trigger 되는지 확인 필요.

### 3.4 fflate import 호환

fflate 0.8.x 는 ESM/CJS 양쪽. esbuild cjs bundle 시 OK. 211 plugin 테스트 통과로 검증. 만약 dogfood 에서 unzip 실패 발견 시 pako 폴백 또는 esbuild treatment 조정.

### 3.5 basePath 환경 분기

`NEXT_PUBLIC_BASE_PATH` 환경변수가 prod build 시 `/notedrop`, dev/preview 시 ``. lib/basePath.ts 의 `withBase()` 가 모든 fetch URL prefix 적용. preview server 는 빈 prefix 라 `/manifest.json` 그대로 요청, GH Pages 는 `/notedrop/manifest.json` 자동.

함정: preview server 는 PreviewServer 가 직접 manifest 응답하므로 basePath prefix 신경 안 써도 됨. dev next build 빌드 산출물 (out/) 에 고정된 fetch URL 이 prod basePath 라면 preview server 에서 404. **preview server 가 서빙하는 zip 은 어떤 환경에서 빌드한 out/ 인가?**

답: GH Actions deploy.yml 가 prod NODE_ENV 로 next build → out/ 에 basePath /notedrop 존재 → GH Pages 에 deploy. 동시에 plugin esbuild 가 viewer/out/ 를 zip 인라인 — **plugin build 도 prod build 라야 한다**. 즉 사용자가 로컬에서 plugin build 하면 viewer/out/ 가 있어야 하고, 그 out/ 가 어떤 NODE_ENV 로 빌드됐는지에 따라 preview server 에서 fetch URL 이 다름.

해결책: plugin esbuild 안에서 viewer build 도 부르되 NODE_ENV 분기 — **단순화: plugin 측에서는 NODE_ENV 미지정 (= dev) 으로 viewer build 시킨다 → basePath 빈값 → preview server 에서 잘 작동. 대신 GH Pages 배포는 deploy.yml 가 별도로 prod build → out/ → upload-pages-artifact 라 영향 받지 않음**.

본 세션 plugin esbuild 는 viewer 가 이미 빌드된 viewer/out/ 를 가정 (자동 viewer build 안 함). 즉 사용자가 `cd viewer && npm run build && cd ../plugin && npm run build`. 이때 viewer build 의 NODE_ENV 안 지정하면 dev 로 처리 → basePath 빈값 → preview server OK.

dogfood 에서 preview server 띄울 때 화면이 빈 셸 (404 manifest fetch) 이면 NODE_ENV 분기가 prod 로 고정되어 있는 것. 그 경우 viewer 를 NODE_ENV 빈값으로 다시 빌드.

### 3.6 manifest.json schema 변경 0

ManifestItem schema 변경 없음. plugin 의 PageFrontmatter / Manifest 와 viewer 의 types/* 가 양립. 하나라도 변경 시 양쪽 동시 갱신 필요.

## 4. 시작 명령 (다음 세션 첫 입력)

> v0.1.25 dogfood. 본 핸드오프 §1 의 Task 1.1~1.5 진행. main push 사용자 승인 받기 (이전 세션 끝). dogfood 결과에 따라 patch (0.1.26+) 또는 release (0.1.25 tag). 발견 버그는 `🐛 fix(viewer|plugin)` commit + 핸드오프 §3 의 함정 표 갱신.

## 5. 결정 메타데이터 (변경 시 갱신)

- viewer/package.json version: 0.1.25 (vanilla 마지막 0.1.24 → bump)
- plugin/package.json version: **0.1.24 그대로** (dogfood 후 bump)
- manifest.json version: **0.1.24 그대로** (dogfood 후 bump)
- main.js 사이즈: 7.4MB (BRAT 첫 다운로드 부담)
- viewer.zip.b64 사이즈: ~2.95MB (143 파일)

## 6. 알려진 미검증

dogfood 에서 검증 의무:
- preview server zip unpack 실 동작 (옵시디언 환경)
- paged.js 페이지 분할 (single page + book)
- mermaid SVG 렌더 (특히 큰 그래프)
- KaTeX 수식 (basePath prefix katex.css 로드)
- customCss 격리 (.notedrop-content prefix)
- SSE 라이브 reload (vault 저장 → 브라우저 1초 내 반영)
- entry hash 라우팅 (/welcome/, 발행 후 /<new-hash>/)
- 페이지 사이즈 변경 + paged.js 재계산
- PDF 다운로드 (window.print + paged.js print stylesheet)
- 사이드바 챕터 클릭 + scrollIntoView
- 우하단 LIVE 뱃지 status

## 7. 본 세션이 못한 것

- viewer 단위 테스트 0 작성 (vitest 의존만 추가, 실 테스트는 dogfood 후)
- 옵시디언 GUI 자동화 미가능 (수동 dogfood)
- 1시간 연속 가동 메모리 측정 (사용자 단계)
- 5MB+ 자산 publish (Tree API blob 한계 검증 — 이미지 큰 경우)
- spec §11.4 release gate 8개 (사용자 dogfood 의무)

본 세션은 코드 회복 + 통합 빌드 검증까지. 실제 사용자 dogfood 가 v0.1.25 release gate.
