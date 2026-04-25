# notedrop

옵시디언 vault 의 일부 노트를 GitHub Pages 정적 뷰어로 발행하는 플러그인 + 뷰어.

- **상태**: v0.1.0 (2026-04-26 릴리스). MVP 기능 셋 완성, dogfood 단계
- **저장소**: [`siakun/notedrop`](https://github.com/siakun/notedrop) (public)
- **뷰어 URL**: [siakun.github.io/notedrop](https://siakun.github.io/notedrop) (GH Pages 자동 배포)
- **라이선스**: TBD

## 어떻게 동작하나

```
┌─────────────────────────┐    PAT + Tree API     ┌─────────────────────────┐
│ Obsidian + notedrop     │ ────────────────────► │ siakun/notedrop (this)  │
│  (vault, plugin)        │                       │  viewer/public/manifest │
│                         │                       │  viewer/public/content/ │
└─────────────────────────┘                       └────────────┬────────────┘
                                                               │ push to main
                                                               ▼
                                                  ┌─────────────────────────┐
                                                  │ GH Actions deploy.yml   │
                                                  │  → GH Pages             │
                                                  └─────────────────────────┘
                                                               │
                                                               ▼
                                                  https://siakun.github.io/notedrop
```

1. Obsidian 노트 frontmatter 에 `notedrop-publish: true` 추가
2. Command palette → `Notedrop: Publish vault to GitHub`
3. 플러그인이 GitHub Tree API 로 변환된 마크다운·자산·매니페스트를 단일 atomic commit
4. push 가 deploy workflow 트리거 → 1~2분 안에 [siakun.github.io/notedrop](https://siakun.github.io/notedrop) 갱신

## 구조

```
/manifest.json          Obsidian plugin metadata (BRAT root 검증)
/styles.css             plugin CSS
/main.js                esbuild 산출물 (release asset, .gitignore)
/plugin/                plugin TypeScript 소스 + 빌드
  └── src/
      ├── domain/       의존 0 (PublishIndex, Resolver, Transformer, AssetCollector, BookAssembler, ManifestBuilder, PublishOrchestrator)
      ├── ports/        VaultFs, MetaCache, GitClient
      ├── infrastructure/ ObsidianVaultFs, ObsidianMetaCache, VaultEventBridge, GitHubPublisher
      ├── settings/     PluginSettings, SettingsTab
      ├── commands/     share/unshare/openList/copyUrl/publishVault
      └── testing/      InMemory*, Fake*
/viewer/                vanilla SPA + esbuild
  └── src/              index.html + app.js + style.css
/docs/                  arc42 13 + ADR 27
/.github/workflows/
  ├── release.yml       tag push → plugin build + GH release
  └── deploy.yml        viewer/ push → GH Pages deploy
```

자세한 설계는 [docs/](./docs/) 의 arc42 + ADR 참고.

## BRAT 으로 설치

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tester) 으로 알파~v1 빌드 설치 가능.

1. Obsidian Community Plugins 에서 **BRAT** 설치 + 활성화
2. Command palette → `BRAT: Add a beta plugin for testing`
3. 입력: `https://github.com/siakun/notedrop`
4. **Add Plugin** 클릭 → BRAT 가 최신 release 의 `main.js`/`manifest.json`/`styles.css` 다운로드
5. Settings → Community Plugins → **Notedrop** 활성화
6. Settings → Notedrop 탭에서:
   - GitHub PAT (fine-grained, contents:write)
   - Target repository (예: `siakun/notedrop`)
   - Target branch (기본 `main`)
   - Public root (기본 `viewer/public`)
   - Share URL base (예: `https://siakun.github.io/notedrop`)

설치 확인: DevTools 콘솔에 `notedrop loaded` + `notedrop: indexed N published note(s)`.

## 명령어

| Command | 동작 |
|---|---|
| `Notedrop: Share this note` | 활성 노트 frontmatter 에 `notedrop-publish: true` |
| `Notedrop: Unshare this note` | `notedrop-publish: false` 로 토글 |
| `Notedrop: Open shared list` | 발행 인덱스 모달, 클릭 시 노트 열기 |
| `Notedrop: Copy share URL` | `<shareUrlBase>/<slug 또는 hash>` 클립보드 복사 |
| `Notedrop: Publish vault to GitHub` | 변환 → Tree API atomic commit |

## 마크다운 지원 범위 (v1.0)

- 표준 마크다운 + GFM (표, 할 일, 인용)
- 옵시디언 위키링크 `[[Note]]`, `[[Note|alt]]`
- 옵시디언 임베드 `![[Note]]` (깊이 1, [ADR-0009](docs/decisions/0009-미발행-ref-안전장치.md))
- 이미지 `![[image.png]]` (png/jpg/svg/webp/gif), 사이즈 `![[img.png|400]]`
- 콜아웃 `> [!note]`, `> [!warning]` 등
- 하이라이트 `==text==`
- 미발행 ref 자동 dead-link 처리 (안전장치)

v2 deferred: KaTeX 수식, Mermaid, 검색, paged.js 페이지네이션, Excalidraw embed, 다크 테마. 자세한 계획은 [11-mvp-and-roadmap.md](docs/11-mvp-and-roadmap.md) §11.2.

## 개발

### 플러그인

```bash
cd plugin
npm install
npm test            # vitest (200 테스트, coverage 97%+)
npm run typecheck
npm run build       # esbuild → ../main.js
npm run dev         # esbuild watch
```

### 뷰어

```bash
cd viewer
npm install
npm run build       # esbuild + static copy → dist/
npm run dev         # esbuild watch + dev server (http://127.0.0.1:4321)
```

### Release

```bash
# manifest.json version 과 tag 일치 (release.yml 검증)
git tag 0.1.0
git push origin main 0.1.0
```

GH Actions:
- `release.yml`: typecheck + test + build → release + main.js/manifest.json/styles.css attach
- `deploy.yml`: viewer/ 변경 시 build → GH Pages 배포

## 마일스톤 진행 (2026-04-26 v0.1.0 시점)

- [x] **M1** Domain layer (179 테스트, 의존 0 도메인 6개 + ports + fakes)
- [x] **M2** Adapters + EventBridge + BRAT 알파 (`0.0.1`)
- [x] **M3** Publishing pipeline + GitHub Tree API (`PublishOrchestrator`, `GitHubPublisher`)
- [x] **M4** Vanilla SPA viewer + GH Pages deploy
- [x] **M5** Polish + ADR-0026/0027 + v0.1.0 release

## v2 백로그

[docs/11-mvp-and-roadmap.md §11.2](docs/11-mvp-and-roadmap.md) 참고. 핵심:
- 라이브 미리보기 SSE (M5 deferred — 정적 publish + GH Pages 만으로 dogfood 진행 가능)
- paged.js 책 페이지네이션
- KaTeX/Mermaid 통합
- 검색 (Lunr.js)
- 변경 감지 (이전 manifest 비교 → 변경 없는 파일 push skip)

## 라이선스

TBD (MIT 검토 중)
