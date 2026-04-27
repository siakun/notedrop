# notedrop

옵시디언 vault 의 일부 노트를 GitHub Pages 정적 뷰어로 발행하는 플러그인.

- **상태**: v0.1.x (dogfood 단계)
- **이 repo**: plugin + 뷰어 **소스 코드**. GH Pages 호스팅 X
- **발행 대상**: 사용자가 별도 public repo 를 만들어 plugin 의 `Target repository` 에 지정 (예: `<username>/<repo>`)
- **라이선스**: TBD

## 어떻게 동작하나

```
┌─────────────────────────┐    PAT + Tree API     ┌─────────────────────────┐
│ Obsidian + notedrop     │ ────────────────────► │ <username>/<share-repo> │
│  (vault, plugin)        │                       │  /index.html /_next/... │
│                         │     로컬 SSE 라이브   │  /manifest.json         │
│  http://127.0.0.1:4321  │ ◄───── 프리뷰 ─────── │  /content/<hash>/       │
└─────────────────────────┘                       └────────────┬────────────┘
                                                               │ push to main
                                                               ▼
                                                  ┌─────────────────────────┐
                                                  │ GitHub Pages (자동)     │
                                                  │  https://<u>.github.io/ │
                                                  │  <share-repo>/          │
                                                  └─────────────────────────┘
```

1. Obsidian 노트 frontmatter 에 `notedrop-publish: true` 추가
2. (선택) 로컬 프리뷰: Settings → Notedrop → **Preview server** [시작] → 브라우저로 `http://127.0.0.1:4321` (저장 시 SSE 라이브 리로드)
3. Settings → Notedrop → **Publish** 버튼 (또는 Command palette: `Notedrop: Publish vault to GitHub`)
4. 플러그인이 GitHub Tree API 로 변환된 마크다운·자산·매니페스트·뷰어를 단일 atomic commit
5. 1~2분 후 `https://<username>.github.io/<share-repo>/` 라이브

## 발행 대상 repo 준비

1. GitHub 에 빈 public repo 생성 (예: `myname/notedrop-share`)
2. 그 repo Settings → Pages → Source = Deploy from a branch, branch = `main`, folder = `/ (root)`
3. plugin Settings 에 그 repo 입력 — 첫 publish 가 README/index.html/manifest 등을 자동 생성 (빈 repo 도 OK)

## 구조 (이 소스 repo)

```
/manifest.json          Obsidian plugin metadata (BRAT root 검증)
/styles.css             plugin CSS
/main.js                esbuild 산출물 (release asset, .gitignore)
/plugin/                plugin TypeScript 소스 + esbuild
  └── src/
      ├── domain/       의존 없음 (PublishIndex, Resolver, Transformer, BookAssembler, ManifestBuilder, PublishOrchestrator)
      ├── ports/        VaultFs, MetaCache, GitClient
      ├── infrastructure/ ObsidianVaultFs, ObsidianMetaCache, VaultEventBridge, GitHubPublisher, PreviewServer
      ├── settings/     PluginSettings, SettingsTab, shareUrl
      ├── services/     PluginContext, DirtyTracker, SeedPersistence, PlanFactory, Logger
      ├── commands/     registry.ts (CommandDef[]) + share/unshare/openList/copyUrl/publishVault/forcePublishVault/resetPublishBaseline/previewServer/showPublishDiff
      └── testing/      InMemory*, Fake*
/viewer/                Next.js Static SPA + React + TypeScript + unified.js
  └── src/
      ├── app/          App Router (layout, page, [hash]/page)
      ├── components/
      │   ├── pages/    RootClient, Home, EntryView
      │   ├── layout/   Header, PageIndicator
      │   ├── panels/   ViewSettingsPanel
      │   ├── book/     Toc, ChapterNav
      │   ├── markdown/ MarkdownRenderer
      │   └── providers/ LiveReloadProvider, ViewSettingsProvider
      ├── lib/          basePath, logger, resource, router, manifestClient, contentClient, paginate, stripController, viewSettings
      ├── hooks/        useManifest, useContent, useRoute, useCustomCss, usePageSizeCss, useLayoutPagination
      ├── markdown-pipeline/  unified + remark plugin (callout, highlight, mermaid)
      └── types/        manifest, content
/docs/                  arc42 13 + ADR 28 + postmortems/
/.github/workflows/
  └── release.yml       tag push → plugin build (viewer 자산 zip 인라인) → GH release
```

> 본 repo 자체에는 GH Pages 데모 사이트 없음. viewer 가 옵시디언 환경(plugin)을 통해 share repo (예: `<username>/notedrop-share`) 에 publish 되므로 본 repo 의 정적 데모는 본질적 파이프라인과 다름. 별도 marketing/문서 데모 사이트가 필요하면 추후 분리.

자세한 설계는 [docs/](./docs/) 의 arc42 + ADR 참고.

## BRAT 으로 설치

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tester) 으로 알파~v1 빌드 설치 가능.

1. Obsidian Community Plugins 에서 **BRAT** 설치 + 활성화
2. Command palette → `BRAT: Add a beta plugin for testing`
3. 입력: `https://github.com/<this-repo-owner>/notedrop`
4. **Add Plugin** 클릭 → BRAT 가 최신 release 의 `main.js`/`manifest.json`/`styles.css` 다운로드
5. Settings → Community Plugins → **Notedrop** 활성화
6. Settings → Notedrop 탭에서:
   - GitHub PAT (fine-grained, contents:write 권한, 발행 대상 repo 만 access)
   - Target repository (`<username>/<share-repo>`)
   - Public root (기본 빈 값 = repo root, 별도 share repo 권장 패턴)
   - Publish viewer assets (기본 ON)

설치 확인: DevTools 콘솔에 `notedrop loaded` + `notedrop: indexed N published note(s)`.

## 명령어

| Command | 동작 |
|---|---|
| `Notedrop: Share this note` | 활성 노트 frontmatter 에 `notedrop-publish: true` |
| `Notedrop: Unshare this note` | `notedrop-publish: false` 로 토글 |
| `Notedrop: Open shared list` | 발행 인덱스 모달, 클릭 시 노트 열기 |
| `Notedrop: Copy share URL` | `<auto-derived-pages-url>/#/<hash 또는 slug>/` 클립보드 복사 |
| `Notedrop: Publish vault to GitHub` | 변환 → Tree API atomic commit. dirty 없으면 noop (Settings 의 Publish 버튼과 동일) |
| `Notedrop: Force publish vault to GitHub` | dirty gate 무시하고 강제 전체 push (escape hatch) |
| `Notedrop: Show publish diff` | 다음 publish 가 보낼 파일 목록과 라인 단위 diff modal (GitHub Desktop 류 split view) |
| `Notedrop: Start/Stop preview server` | 로컬 http://127.0.0.1:4321 서버 (SSE 라이브 리로드) |
| `Notedrop: Open preview in browser` | 시작 + 브라우저 자동 오픈 |

## 마크다운 지원 범위 (v0.1 MVP)

- 표준 마크다운 + GFM (표, 할 일, 인용)
- 옵시디언 위키링크 `[[Note]]`, `[[Note|alt]]`
- 옵시디언 임베드 `![[Note]]` (깊이 1, [ADR-0009](docs/decisions/0009-미발행-ref-안전장치.md))
- 이미지 `![[image.png]]` (png/jpg/svg/webp/gif), 사이즈 `![[img.png|400]]`
- 콜아웃 `> [!note]`, `> [!warning]`, `> [!info]` 등 (옵시디언 코어 13 variant + 25 alias 정규화)
- 하이라이트 `==text==`
- 수식 `$inline$`, `$$block$$` (KaTeX)
- Mermaid 다이어그램 (` ```mermaid ` 블록, 클라이언트 렌더)
- 풋노트 `[^1]`, 블록 ID `^id`, 태스크 `- [ ]`
- 미발행 ref 자동 dead-link 처리 (안전장치)
- 페이지 사이즈 5종 (A3/A4/A5/B5/B6) + paged.js 페이지네이션 + PDF 다운로드
- 페이지별 customCss 격리 주입
- 라이브 리로드 (preview server SSE)

v2 deferred: 검색 (Lunr.js), Excalidraw embed, 다크 테마, 커스텀 도메인, 변경 감지 publish (manifest diff). 자세한 계획은 [11-mvp-and-roadmap.md](docs/11-mvp-and-roadmap.md) §11.2.

## 개발

### 플러그인

```bash
cd plugin
npm install
npm test            # vitest (211 테스트)
npm run typecheck
npm run build       # esbuild → ../main.js (viewer/out → viewer.zip.b64 자동 인라인)
npm run dev         # esbuild watch
```

### 뷰어

```bash
cd viewer
npm install
npm test            # vitest (54 테스트)
npm run typecheck
npm run build       # next build → out/ (Next.js export, basePath = /__NOTEDROP_BASE__ placeholder)
npm run dev         # next dev (http://localhost:3000)
```

뷰어 자산은 plugin 빌드 시 `viewer/out/` 의 모든 파일이 zip 으로 묶여 `plugin/src/embedded/viewer.zip.b64` 로 인라인 됩니다. plugin 의 PreviewServer 가 시작 시 이 zip 을 메모리에 풀어 정적 자산으로 서빙. 따라서 plugin 빌드 직전에 viewer 빌드가 선행되어야 새 viewer 가 인라인 됩니다.

### Release

```bash
# manifest.json version 과 tag 일치 (release.yml 검증)
git tag 0.1.9
git push origin main 0.1.9
```

`release.yml` 가 viewer 빌드 → plugin typecheck/test/build → release + `main.js`/`manifest.json`/`styles.css` attach.

## 마일스톤 (2026-04-26 v0.1.x 시점)

- [x] **M1** Domain layer (의존 없음 도메인 6 + ports + fakes)
- [x] **M2** Adapters + EventBridge + BRAT 알파 (`0.0.1`)
- [x] **M3** Publishing pipeline + GitHub Tree API
- [x] **M4** Viewer = Next.js + React + TypeScript + unified.js (spec §5.2 표준 복귀, ADR-0011/0012)
- [x] **M5** Polish + Preview server (SSE 라이브 리로드)
- [x] **M5.5** dogfood 사이클: bootstrap manifest 덮어쓰기 fix (v0.1.40), Command Pattern + Service Layer 리팩토링 (v0.1.33), basePath placeholder (v0.1.34), diff-based publish (v0.1.34), Debug mode FileLogger (v0.1.39), viewer Hexagonal 재구성 (v0.1.42)
- [ ] **M6** dogfood 마무리 + community plugins 마켓 등재 (v1.0 안정화)

## v2 백로그

[docs/11-mvp-and-roadmap.md §11.2](docs/11-mvp-and-roadmap.md) 참고. 핵심:
- 검색 (Lunr.js 클라이언트 인덱스 + 결과 UI)
- Excalidraw embed
- 다크 테마
- 변경 감지 publish (이전 manifest 비교 → blob 호출 skip)
- 커스텀 도메인 (CNAME) 지원
- 챕터별 lazy 페이지네이션 (큰 책 paged.js 성능)

## 라이선스

TBD (MIT 검토 중)
