---
date: 2026-04-26
type: 핸드오프
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - m2
  - handoff
summary: M1 완료 후 새 세션에서 M2 (Infrastructure 통합 + BRAT 배포) 를 컨텍스트 손실 없이 시작하기 위한 프롬포트 + 결정 사항 기록
---
# Notedrop M2 핸드오프

새 Claude Code 세션 첫 입력으로 전체 붙여넣기.

---

## 0. 컨텍스트

작업 디렉터리: `C:\Users\User\Documents\github_siakun\notedrop`
원격: `https://github.com/siakun/notedrop` (origin/main, force-push 끝)
M1 완료 태그: `m1-domain-complete` (한국어 commit 25개)
백업 (M1 영문 버전): 태그 `m1-domain-complete-en-backup` + 브랜치 `backup-main-en`

메모리 자동 로드 (확인용):
- user: GitHub URL owner 는 `siakun` (sia819 X)
- feedback: 구조적 원인 우선, 임시방편 금지
- feedback: gitmoji + type + 한국어 subject (`<emoji> <type>(<scope>): <subject>`)
- project: notedrop 개발 디렉터리, spec 위치 `docs/`
- reference: 커밋수정 스킬 (`skills/커밋수정.md`)

## 1. 최종 목표

옵시디언 BRAT 플러그인에 `https://github.com/siakun/notedrop` URL 입력 -> 설치 진행 가능 상태.

이를 위해 필요한 4가지:
1. Obsidian plugin 빌드 가능 (esbuild -> main.js)
2. `manifest.json` 이 repo root 에 commit 됨 (BRAT 가 `raw.githubusercontent.com/siakun/notedrop/main/manifest.json` 으로 검증)
3. GitHub Release 에 main.js + manifest.json + styles.css 가 attached (BRAT 가 다운로드)
4. README 에 BRAT 설치 가이드

## 2. M1 완료 산출물 (재사용, 재구현 금지)

`plugin/src/`:
- `types.ts`: Manifest, ManifestItem, PageFrontmatter (public 출력)
- `domain/types.ts`: PublishedItem, Reference, ResolvedContent, TransformedContent, AssetRef, ChapterPlan
- `ports/`: VaultFs, MetaCache, GitClient (인터페이스만)
- `testing/`: InMemoryVaultFs, FakeMetaCache, FakeGitClient
- `domain/`: PublishIndex, ContentResolver, ContentTransformer, AssetCollector, BookAssembler, ManifestBuilder

테스트 통과: 179 passed, coverage Lines 97.32% / Functions 100% / Branches 88.12%
검증: `cd plugin && npm test && npm run typecheck` 모두 0

M1 plan 원본: `docs/superpowers/plans/2026-04-26-m1-domain-layer.md`

## 3. M2 범위 (이 세션)

spec `docs/11-mvp-and-roadmap.md` §11.5 M2 산출물 + BRAT 배포 인프라:

- ObsidianVaultFs (VaultFs port 의 `app.vault.adapter` Adapter)
- ObsidianMetaCache (MetaCache port 의 `app.metadataCache` Adapter)
- VaultEventBridge (vault/meta event -> PublishIndex.upsert/remove/rename)
- main.ts (Plugin entry: load/unload, 의존 와이어업)
- 설정 UI 골격 (PluginSettings type + SettingsTab 뷰)
- 명령어 등록 (Share, Unshare, Open shared list, Copy share URL)
- esbuild 빌드 시스템
- GitHub Actions release workflow (tag push -> build + upload assets)
- README BRAT 설치 안내
- ADR-0025 (manifest.json repo root 위치 결정 명문화)

검증 (M2 합격 기준): 빌드된 plugin 을 Obsidian 에 로드 -> 노트 frontmatter 토글 -> PublishIndex 갱신 확인.
BRAT 검증: 사용자가 BRAT 에 URL 입력 -> 설치 진행 -> 활성화 시 console "notedrop loaded" 등.

## 4. 결정된 파일 레이아웃 (spec §5.4 일부 변경)

```
/manifest.json                  ← Obsidian plugin metadata (BRAT root 검증용)
/styles.css                     ← optional, 일단 빈 파일
/main.js                        ← esbuild 산출물 (.gitignore, release attach)
/plugin/
  ├── package.json              ← 이미 존재 (build 스크립트 추가 필요)
  ├── tsconfig.json             ← 이미 존재
  ├── vitest.config.ts          ← 이미 존재
  ├── esbuild.config.mjs        ← 새로 작성
  └── src/
      ├── main.ts               ← 새로 작성 (Plugin entry)
      ├── settings/
      │   ├── PluginSettings.ts
      │   └── SettingsTab.ts
      ├── commands/
      │   ├── shareNote.ts
      │   ├── unshareNote.ts
      │   ├── openSharedList.ts
      │   └── copyShareUrl.ts
      ├── infrastructure/
      │   ├── ObsidianVaultFs.ts
      │   ├── ObsidianMetaCache.ts
      │   └── VaultEventBridge.ts
      ├── domain/               ← M1, 변경 X
      ├── ports/                ← M1, 변경 X
      ├── testing/              ← M1, 변경 X
      └── types.ts              ← M1, 변경 X
/.github/workflows/release.yml  ← tag push -> build + release attach
/README.md                      ← BRAT 설치 안내 추가
```

**Spec §5.4 변경 사유**:
- 원래 spec 은 `plugin/manifest.json` 위치 (단일 plugin 레포 가정)
- BRAT 는 repo root 의 manifest.json 으로 plugin 검증
- 본 프로젝트는 plugin/ + viewer/ monorepo 라 root 와 plugin/ subfolder 가 분리
- 변경: manifest.json + main.js + styles.css 를 root 에. spec 의 다른 부분은 그대로 유효
- ADR-0025 로 명문화(이 세션 작업)

## 5. 결정된 메타데이터

- 플러그인 id: `notedrop` (ADR-0022)
- 버전: `0.0.1` (BRAT alpha 테스트용. spec MVP 합격기준 충족 시 0.1.0 사용)
- minAppVersion: `1.4.0`
- isDesktopOnly: `true` (Node http 의존, ADR-0011 + 0014)
- name: `Notedrop`
- description: 영문 1~2 문장 (Obsidian 마켓플레이스 노출 시 사용)
- author: `Sia819`, authorUrl: `https://github.com/siakun`

## 6. M2 작업 순서 (제안 phase)

### Phase A: 빌드 가능한 최소 plugin (BRAT 의 1번 + 2번 충족 직전)

1. `obsidian` 패키지 추가 (`cd plugin && npm i -D obsidian@latest`)
2. `/manifest.json` 작성 (위 §5 메타데이터)
3. `/styles.css` 작성 (빈 파일 또는 `/* notedrop styles */` 만)
4. `plugin/esbuild.config.mjs` 작성 (entry: src/main.ts, output: ../main.js, format: cjs, externals: obsidian + node 빌트인, sourcemap inline-dev/external-prod)
5. `plugin/package.json` 에 `build`, `dev` 스크립트 추가
6. `plugin/src/main.ts`: Plugin 클래스 onload/onunload 만 (console.log 두 줄)
7. `cd plugin && npm run build` -> `/main.js` 생성 확인
8. 루트 `.gitignore` 에 `main.js` 추가
9. typecheck + test (M1 회귀 없는지 확인)
10. 커밋 (gitmoji + 한국어, 예: `🔧 chore(plugin): M2 plugin entry + esbuild 스캐폴드`)

### Phase B: Adapters

1. `plugin/src/infrastructure/ObsidianVaultFs.ts` (VaultFs 구현, `app.vault.adapter`)
   - read = `adapter.read(path)`, readBinary = `adapter.readBinary(path)` (returns ArrayBuffer -> Uint8Array)
   - listAllFiles = `app.vault.getFiles()` 또는 `getMarkdownFiles()` 매핑
   - listFiles(folder) = `adapter.list(folder)` -> files
   - searchByName = `getFiles().filter(f => f.name === name)`
   - writeFile = `adapter.write(path, content)`
   - 가능한 한 unit test (obsidian mock 어렵, 최소 type check 만)
2. `plugin/src/infrastructure/ObsidianMetaCache.ts`
   - getFrontmatter = `app.metadataCache.getFileCache(file)?.frontmatter`
   - getHeadings, getLinks 동일 패턴
   - on('changed') = `app.metadataCache.on('changed', ...)`
   - on('deleted') = `app.vault.on('delete', ...)`
   - on('renamed') = `app.vault.on('rename', ...)`
   - 모든 on 은 Obsidian EventRef 반환, 우리 시그니처는 unsubscribe fn 반환 -> wrap
3. `plugin/src/infrastructure/VaultEventBridge.ts`
   - Bridge 가 Adapters 의 on() 들을 구독
   - changed -> `index.upsert(path)`
   - deleted -> `index.remove(path)`
   - renamed -> `index.rename(oldPath, newPath)`
   - 200ms 디바운스 (spec §6.7) - 빠른 연속 수정 보호
4. main.ts 와이어업: VaultFs/MetaCache 인스턴스 -> PublishIndex.build({bookAssembler}) -> Bridge.start()
5. 가능한 unit test (Bridge 는 fake event source 로 테스트 가능)
6. 커밋

### Phase C: Settings + Commands

1. `plugin/src/settings/PluginSettings.ts`: 타입 정의 (githubPat, targetRepo, port, autoStart, autoUnpublish), DEFAULT 상수
2. `plugin/src/settings/SettingsTab.ts`: PluginSettingTab 상속, 폼 UI (PAT 는 password input, repo 는 text, port 는 number)
3. `plugin/src/commands/shareNote.ts`:
   - 현재 활성 파일 가져옴 (`app.workspace.getActiveFile()`)
   - `app.fileManager.processFrontMatter(file, fm => { fm['notedrop-publish'] = true })`
   - `index.upsert(file.path)` 호출 (Bridge 가 메타 이벤트로 자동 처리도 가능, 명시적 호출이 더 결정적)
   - Notice("공유됨")
4. `plugin/src/commands/unshareNote.ts`: 반대로 토글
5. `plugin/src/commands/openSharedList.ts`: index.list() 결과를 Modal 로 표시 (간단한 list)
6. `plugin/src/commands/copyShareUrl.ts`: `https://siakun.github.io/notedrop/<slug 또는 hash>` 클립보드 복사
7. main.ts 명령어 등록 + Settings 로드/저장
8. 커밋 (Phase 단위 또는 명령어별 분할)

### Phase D: BRAT 배포 인프라

1. `.github/workflows/release.yml`:
   ```yaml
   on:
     push:
       tags: ['*.*.*']  # semver 패턴
   jobs:
     release:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: '20' }
         - name: Install
           working-directory: plugin
           run: npm ci
         - name: Build
           working-directory: plugin
           run: npm run build
         - name: Release
           uses: softprops/action-gh-release@v2
           with:
             files: |
               main.js
               manifest.json
               styles.css
   ```
2. `README.md`: 프로젝트 소개 + BRAT 설치 안내 (BRAT 설치 -> Add Beta Plugin -> URL 입력 -> Add Plugin)
3. `docs/decisions/0025-manifest-위치-repo-root.md` ADR 작성
4. 커밋

### Phase E: 검증 + 릴리스

1. 사용자에게 push 권한 요청 (이전 force-push 처럼 명시적)
2. `git tag 0.0.1` (BRAT 가 v prefix 없는 semver 권장)
3. `git push origin main 0.0.1` (브랜치 + 태그)
4. GH Actions 자동 실행 -> release 생성 + asset upload 확인
5. 사용자에게 BRAT 설치 테스트 요청 (URL: `https://github.com/siakun/notedrop`)
6. 결과 보고

## 7. 컨벤션 (메모리에 있어 자동 적용되지만 강조)

- 커밋: `<gitmoji> <type>(<scope>): <한국어 subject>` 형식 (마침표 없음)
- type: feat 새 기능, fix 버그, docs 문서, chore 잡일, refactor, test, ci, build, perf, style
- 임시방편 금지: 표면 fix 전에 "왜 이 위치에서?" 질문, 트레이드오프 같이 제시
- TDD: 새 코드는 실패 테스트 먼저 (단, Obsidian API 의존 부분은 어려움 - 가능한 한도 내에서)
- Hexagonal: Adapter 가 Domain 호출, Domain 은 Adapter 모름 (의존 방향 단방향)
- em-dash 금지 (커밋·문서 모두). gitmoji 외 키보드 미입력 특수문자 금지
- Push 는 사용자 명시 승인 후만

## 8. 알려진 함정

- Obsidian API 는 sync, Domain 은 async -> Adapter 가 `Promise.resolve()` 로 감싸 변환
- VaultFs.readBinary 는 Uint8Array, Obsidian adapter.readBinary 는 ArrayBuffer -> `new Uint8Array(buffer)` 변환
- frontmatter 쓰기 = `app.fileManager.processFrontMatter(file, fn)` (직접 readFile/writeFile 보다 안전, YAML 파싱·재직렬화 자동)
- Settings 보관 = `this.saveData(settings)` / `this.loadData()` (자동 `.obsidian/plugins/notedrop/data.json`)
- PAT 콘솔/에러 메시지 노출 절대 금지 (spec §9.7)
- VaultEventBridge 디바운스 200ms (spec §6.4 캐시 전략)
- BRAT 는 manifest.json 의 `version` 필드를 release tag 와 비교 -> 일치해야 정상 인식
- esbuild output: `format: 'cjs'` (Obsidian 은 CommonJS 로드), `platform: 'node'`, externals 에 `obsidian`, `electron`, node 빌트인 모두

## 9. 시작 명령 (이 세션에서)

이 핸드오프 전부 입력 후, 첫 명령:

> M2 진행. spec 은 `docs/`, M1 완성 commit 은 main, 위 가이드라인 따라서 Phase A 부터 자동 진행. Phase 마다 commit, 각 Phase 끝나면 짧게 보고. push 시점 (Phase E step 2) 에만 사용자 승인 요청. Auto mode 켜져 있다고 가정.
