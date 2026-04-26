---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - arc42
  - ux
  - dogfood
summary: dogfood 반복 중 사용자가 직접 지시한 UI/UX 사양·명명 규칙·설정 시맨틱·영속화 정책. arc42 표준 12 섹션 외 프로젝트 고유 항목으로 별도 섹션 신설
---
# 13. Dogfood 주도 UX 요구사항

본 섹션은 spec 초기 (M1~M2) 에 결정되지 않고, **dogfood 진행 중 사용자가 직접 명시한 UI/UX 사양·명명 규칙·설정 시맨틱·영속화 정책** 을 누적 기록한다. 아키텍처 결정은 ADR 로 분리, 본 문서는 *행동·표면 결정* 만.

각 항목 형식:
- **결정**: 무엇이 정해졌나
- **사유**: 사용자가 명시한 이유 또는 dogfood 발견 사항
- **위치**: 코드/문서 진입점

## 13.1 명명 규칙

### 13.1.1 코드/테스트의 placeholder = `username`

- **결정**: 코드·UI placeholder·테스트 fixture 모두 사용자 GitHub 핸들 (`siakun`) 또는 일반 placeholder (`acme`) 가 아닌 **`username`** 으로 통일
- **사유**: 사용자 명시 — 본 repo 가 OSS 로 공개될 때 사용자 자신의 핸들이 코드/테스트에 박히면 부자연스럽고, `acme` 같은 영문 관용 placeholder 는 한국어 화자에게 직관적이지 않음
- **위치**:
  - `plugin/src/settings/SettingsTab.ts` Target repo placeholder
  - `plugin/src/settings/shareUrl.test.ts`, `plugin/src/infrastructure/GitHubPublisher.test.ts`, `plugin/src/testing/FakeGitClient.test.ts` fixture
  - `viewer/public/content/welcome/index.md` (외부 링크 제거)
  - 예외 (의도적 유지): `manifest.json` author/authorUrl, README, ADR, git author/log

## 13.2 설정 (Plugin Settings) UI 패턴

### 13.2.1 메뉴 우선순위 순서

- **결정** (top → bottom):
  1. **액션** (자주 씀): Publish to GitHub 버튼, Preview server 버튼
  2. **발행 설정**: GitHub PAT, Target repository
  3. **미리보기 설정**: Auto start preview
  4. **동작 옵션**: Auto unpublish on delete
  5. **공유된 노트** (정보용 리스트)
  6. **고급 설정** (단일 collapsible): Target branch / Public root / Publish viewer assets / Preview port
- **사유**: dogfood 첫 화면에 자주 쓰는 액션이 보여야 함. 99% 기본값으로 충분한 항목은 `<details>` 트리 하나에 몰아 시각적 잡음 제거
- **위치**: `plugin/src/settings/SettingsTab.ts` (각 `render*Settings` 메서드)

### 13.2.2 액션은 버튼, 토글 X

- **결정**: 즉시 실행 (Publish, Start/Stop preview) 은 버튼 형식, 상태 토글 (auto start, auto unpublish) 만 토글 사용
- **사유**: 토글로 액션을 표현하면 "지금 실행" vs "다음에 자동 실행" 구분이 모호. PDF Expert / GitHub Desktop 류 패턴 차용
- **위치**: `SettingsTab.ts` 의 `renderActions()` 가 `addButton` 사용. 색상은 Obsidian 표준 클래스 (`mod-cta` = 파랑 시작, `mod-warning` = 빨강 중지)

### 13.2.3 고급 설정 = 단일 `<details>` 트리

- **결정**: `<details><summary>` HTML native 사용. 기본 접힘. 한 트리에 모든 고급 항목 (발행/미리보기/동작 분류 X). 펼침 상태 영속화 X
- **사유**: 카테고리별 multiple `<details>` 는 계단처럼 보임. 단일 트리가 시각 경계 1 개로 가벼움. native `<details>` 라 닫혔다 열면 자동 접힘 — 영속화 코드 추가 안 함
- **위치**: `SettingsTab.renderAdvanced()` + `styles.css` 의 `.notedrop-advanced` (chevron `▶ → ▼` rotate)

### 13.2.4 Target repository description 에 GH Pages 하이퍼링크

- **결정**: Target repo 입력란 description 에 자동 도출된 GH Pages URL 을 클릭 가능 링크 (`<a target=_blank>`) 로 표시
- **사유**: 사용자가 별도 *Share URL base* 항목을 다시 입력할 필요 없게 — `targetRepo` 만으로 도출 가능하므로 두 번 묻지 않음
- **위치**: `SettingsTab.ts` 의 `renderPublishSettings()` 에서 `createFragment` 로 `<br>` + `<a>` 추가
- **관련**: §13.3.2 (`shareUrlBase` 제거)

### 13.2.5 Preview server URL 하이퍼링크

- **결정**: Preview server 실행 중일 때 description 의 `http://127.0.0.1:4321` 도 클릭 가능
- **사유**: dogfood 시 reload 후 빠른 접속

## 13.3 발행 설정 시맨틱

### 13.3.1 `publicRoot` 기본 = 빈 문자열 (= repo root)

- **결정**: 기본값 `''`. share repo 패턴 (`<username>/notedrop-share` 같은 별도 repo) 권장
- **사유**: 별도 repo 가 발행 콘텐츠 + 뷰어 자산 + manifest 모두 root 에 두는 게 가장 단순 (GH Pages legacy source 가 `/` 또는 `/docs` 만 허용). 모노레포 (viewer 자산이 `viewer/public/` 하위) 케이스는 사용자가 명시 입력
- **위치**: `plugin/src/settings/PluginSettings.ts` `DEFAULT_SETTINGS.publicRoot = ''`

### 13.3.2 `shareUrlBase` 제거 → `targetRepo` 자동 도출

- **결정**: 별도 `shareUrlBase` 설정 항목 제거. `targetRepo` 가 `<owner>/<repo>` 형식이면 자동 도출:
  - `<owner>.github.io/<repo>` (일반)
  - `<owner>.github.io` (`repo == <owner>.github.io` 인 user/org page)
- **사유**: 두 번 묻지 않기. 커스텀 도메인 (CNAME) 지원은 v2 deferred — 현재 사용자 모두 `<owner>.github.io/<repo>` 형식
- **위치**: `plugin/src/settings/shareUrl.ts` (`deriveShareUrlBase`, `resolveShareUrlBase`) + `plugin/src/commands/copyShareUrl.ts`

### 13.3.3 `publishViewerAssets` 기본 ON + `.nojekyll` 자동 포함

- **결정**: publish 마다 viewer 자산 (zip 풀어 모든 파일) + `.nojekyll` 빈 파일 push
- **사유**: GH Pages 의 Jekyll 이 기본 활성 → `.md` 파일을 HTML 변환 → viewer 의 `fetch('content/<hash>/index.md')` 가 404. `.nojekyll` 로 비활성. share repo 가 비어 있을 때 viewer 도 같이 push 해야 GH Pages 가 정적 사이트로 동작
- **위치**: `plugin/src/commands/publishVault.ts` 의 `collectViewerFiles()`

### 13.3.4 Copy share URL 형식 = hash 라우팅

- **결정**: `<base>/#/<slug 또는 hash>/` (`#/` 포함)
- **사유**: 뷰어가 hash 라우팅 (Next.js Static Export + 동적 [hash] 라우트). `#/` 없으면 viewer 가 라우트 인식 못 함
- **위치**: `plugin/src/commands/copyShareUrl.ts`

## 13.4 발행 영속화 (Persistence)

### 13.4.1 Hash 형식 = dashed UUID

- **결정**: `randomUUID()` 결과 그대로 (예: `17813d9c-0e93-4378-b96b-a2dff213ec8e`). 32-hex (`replace(/-/g, '')`) 금지
- **사유**: 사용자가 표준 UUID 형식 선호. share repo path / URL 가독성 + 표준 식별자 인식 (브라우저 자동완성, IDE 내장 search 등)
- **위치**: `plugin/src/domain/PublishIndex.ts` `newHash()` (테스트 HASH_RE 도 dashed 형식)
- **마이그레이션**: `plugin/src/main.ts` `dashifyHash()` 가 옛 32-hex seed 를 자동 dashed 로 변환

### 13.4.2 `publishedSeeds` 영속화 (재시작 hash 고정)

- **결정**: `data.json` 의 `publishedSeeds: SeedEntry[]` (`{filePath, hash, slug, publishedAt}`) 가 plugin 재시작·Obsidian 재실행 후에도 같은 hash 유지
- **사유**: 발행 URL 이 매번 바뀌면 외부 링크 깨짐
- **위치**: `plugin/src/main.ts` 가 onload 에서 `index.seed(seeds)` 호출, index 이벤트 (added/changed/removed/rename) 마다 500ms 디바운스 후 snapshot 저장
- **rename 트리거**: `PublishIndex.rename` 이 `emit('changed')` 호출하므로 영속화 자동

### 13.4.3 Dirty 추적 = 즉시 boolean + 설정 패널 진입 시 lazy digest 정정

- **결정**: 두 단계
  1. 노트 저장 시: `unpublishedChanges = true` 즉시 (가벼움, 200ms Bridge 디바운스 후 1회)
  2. 설정 패널 열릴 때: `revalidateDirty()` 비동기 호출 → SHA-256 content digest 와 `lastPublishedDigest` 비교 → 같으면 `unpublishedChanges = false` 로 정정 + render() 재호출
- **사유**: "타이핑 후 되돌리기" 시 buffer 가 변동되어 dirty=true 되지만 콘텐츠는 동일 — 설정 패널 보러 가면 자동으로 [발행됨] 으로 정정 (불필요한 publish 방지)
- **digest 제외 필드** (timestamps stripVolatile):
  - `manifest.json` 의 `generatedAt`, `updatedAt`
  - 페이지 `index.md` 의 `updatedAt`
- **위치**: `plugin/src/main.ts` `computeContentDigest`, `revalidateDirty` + `SettingsTab.ts` `revalidateInBackground` (display 후 호출)

### 13.4.4 변경 보기 (diff) 모달

- **참조 디자인**: 사용자가 GitHub Desktop diff viewer 스크린샷 제공 (검은 배경, 좌측 사이드바 = "6 changed files" 헤더 + 파일 리스트, 우측 메인 = `manifest.json` 헤더 + `@@ -1,7 +1,7 @@` hunk 헤더 + 좌/우 split diff + 라인 번호 + sign 컬럼 + 단어 단위 빨강·녹색 mark)
- **결정**: 그 디자인 그대로 옵시디언 Modal 안에 재현
  - **좌측 사이드바** (280px 고정 폭):
    - 헤더: `N changed files` (숫자 = 추가+수정+삭제 합계)
    - 각 파일 li: `<filename>` + 우측 상태 뱃지
      - 추가 = 초록 `+` (`#22c55e` 18% 알파 배경, glyph 색 #22c55e)
      - 수정 = 노랑 `●` (`#eab308` 18%)
      - 삭제 = 빨강 `−` (`#ef4444` 18%)
    - 클릭 시 우측 패널 갱신, 활성 파일은 `is-active` 배경
  - **우측 main** (1fr):
    - 헤더 = 파일 path (monospace)
    - 본문 = hunks (각 hunk: 헤더 `@@ -<start>,<count> +<start>,<count> @@` + rows)
    - row grid: 6열 (라인 번호·sign·코드 ─ 좌측, 라인 번호·sign·코드 ─ 우측)
      - context (변경 없음): 양쪽 동일 라인, 라인 번호 회색
      - modified: 좌측 빨강 배경 `−`, 우측 녹색 배경 `+`, 단어 단위 `<mark>` 진한 빨강/녹색
      - added (좌측 빈 칸 + 우측 녹색)
      - removed (좌측 빨강 + 우측 빈 칸)
- **단어 단위 하이라이팅**: `Diff.diffWordsWithSpace(oldLine, newLine)` 결과를 좌/우 라인의 token 으로 렌더, added/removed token 만 `<mark>` 로 감싸 진한 색
- **hunk 그룹화**: 변경 라인 ±3 라인을 한 hunk 로 묶고 인접 hunks 자동 병합
- **modal 사이즈**: 92vw × 90vh (PDF/diff 류는 화면 거의 전체 차지가 자연스러움)
- **사유**: dogfood 시 무엇이 push 될지 미리 보고 의도와 일치하는지 검증. 사용자 명시 — "라인 단위 diff" 까지 보고 싶음
- **위치**: `plugin/src/commands/showPublishDiff.ts` (DiffModal + renderEntry/renderRow + computeHunks/diffWords 호출) + `plugin/src/main.ts` `computePlanSnapshot` (per-file hash + raw text 저장) + `styles.css` `.notedrop-diff-*` (200+ 줄 CSS)
- **저장 부담**: `lastPublishedFiles: Record<path, {hash, text|null}>` — 100 노트 vault 기준 ~수백 KB ~ 1MB. binary 는 text=null (diff 시 "binary file (텍스트 diff 미지원)" placeholder)
- **deferred**: 외부 (GitHub repo) 와 비교 — 현재는 마지막 push 했던 로컬 스냅샷 기준이라 share repo 가 외부에서 수정되면 감지 X. v2 에서 GH API 로 실 remote diff 추가 검토

## 13.5 Viewer (Next.js + React + unified.js) UI 사양

### 13.5.0 참조 디자인 (사용자 제공 이미지 매핑)

dogfood 중 사용자가 직접 스크린샷을 제공해 *이 디자인 그대로 만들어달라* 고 지시한 항목 매핑:

| 항목 | 참조 앱 | 차용한 요소 |
|---|---|---|
| View Settings popover (전체 골격) | **PDF Expert** (iOS, 검은 테마) | 우상단 `[aA]` 아이콘 → 클릭 시 우측 popover, "View Settings" 헤더 가운데 정렬, 항목 카드형 grid 배치 |
| 테마 3종 (Day/Sepia/Night) + 원형 swatch | **PDF Expert** | 56px 원형 swatch 안에 "Aa" 글자, swatch 색이 그 테마 배경, 활성 시 파란 ring border, 아래 라벨 (Day/Sepia/Night) |
| 레이아웃 3종 (Vertical/Horizontal/Two Pages) + 아이콘 카드 | **PDF Expert** (View Settings popover 상단) | 사각 카드 안에 아이콘 + 라벨, 활성 시 파란 border + accent 색 |
| 폰트 dropdown (원본/Arial/Georgia/Times/Trebuchet/Verdana...) | **Google Play Books** (어두운 테마 X 일반 흰 테마) | `<select>` 표준, 사용자 시스템 dropdown 그대로 |
| 글꼴 크기 / 행 간격 stepper (T- 100% T+, ↕- 100% ↕+) | **Google Play Books** | 좌우 버튼 + 가운데 % 라벨 (T-/T+ 기호) |
| 정렬 토글 (왼쪽 / 양쪽) | **Google Play Books** | 두 버튼 중 활성 = 파란 배경 |
| 페이지 인디케이터 (12 / 281, 12–13 / 281) | **PDF Expert** (우하단) | 우하단 floating pill, monospace 숫자, en-dash 로 pair 구분 |
| 헤더에 entry 제목 노출 | **Google Play Books** (상단 바에 책 제목) | 본문 안 `<h1>` 제거, 상단 헤더가 제목 역할 |
| 다중 페이지 종이 시각 (Vertical Scroll) | **PDF Expert** (Vertical Scroll 모드) | 페이지마다 paper bg + shadow + border, 페이지 사이 canvas 색 gap 1rem |
| 두 페이지 펼침 (Two Pages) | **PDF Expert** (Two Pages 모드, 서적 펼침 시각) | 좌우 두 페이지 동시 표시, 각 페이지에 4 방향 margin, 가운데 작은 gap |

### 13.5.1 View Settings popover 전체 구조 (PDF Expert 기반)

상단 헤더 우측 끝의 `[aA]` 아이콘 버튼 클릭 → 우측 popover (320px 폭) 슬라이드 다운.

**popover 내부 섹션 순서 (위 → 아래)**:
1. "보기 설정" (가운데 정렬 헤더)
2. **레이아웃** (4 카드 2x2 grid) — Default / Vertical Scroll / Horizontal Scroll / Two Pages
3. **페이지 크기** (4 버튼 가로 grid, 책 모드에서만 노출) — B4 / A4 / B5 / A5
4. **여백 (mm)** (2x2 grid, 책 모드에서만) — 상/하/좌/우 number input
5. **테마** (3 원형 swatch 가로) — Day / Sepia / Night
6. **글꼴** (dropdown) — 8 옵션
7. **글꼴 크기** (T- % T+ stepper)
8. **행 간격** (↕- % ↕+ stepper)
9. **정렬** (왼쪽 / 양쪽 토글)

각 섹션 라벨 = uppercase letter-spacing muted color, 항목 간 1.1rem 마진.

**열기/닫기**: `[aA]` 클릭 토글, popover 외부 클릭 시 자동 닫힘 (`mousedown` listener), `<select>` dropdown 의 옵션 클릭은 panel 내부로 인식돼 닫히지 않음.

**아이콘**: `[aA]` 는 작은 A + 큰 A 두 글자를 수직 baseline 정렬 (PDF Expert 와 동일 글리프).

### 13.5.2 테마 3종 + Night 기본 (PDF Expert swatch 디자인)

- **swatch 시각** (PDF Expert 원형 그대로):
  - Day: `#fff` 배경 + `#191919` "Aa" + 옅은 회색 border
  - Sepia: `#f4ecd8` 배경 + `#5b4636` "Aa" + border 없음
  - Night: `#2a2a2a` 배경 (canvas 보다 살짝 밝게) + `#f0efed` "Aa" + border 없음
- **활성 시**: swatch 둘레 2px 파란 border (`var(--color-accent)`), 라벨 텍스트 `text-normal` + `font-weight: 500`. 비활성 라벨은 muted
- **호버 시**: swatch `transform: scale(1.05)` (살짝 부풀어 인터랙티브 느낌)
- **팔레트** (`siakun-private/.obsidian/snippets/notion-dark.css` 참조):
  - Night: `--color-bg: #191919`, `--color-bg-elevated: #202020`, `--color-text: #f0efed`, `--color-accent: #2383e2` (Notion 블루)
  - Day: `#fff` / `#fafaf7` / `#191919` / 같은 accent
  - Sepia: `#f4ecd8` / `#ede4cf` / `#5b4636` / `#8b6f3a` (sepia accent 갈색 톤)
- **사유**: 사용자 vault 의 Notion-dark snippet 과 Night 톤 통일 — dogfood 시 옵시디언 ↔ viewer 시각 일관성. Sepia 는 클래식 ebook (Apple Books/Kindle 류) 톤
- **localStorage 영속**: `notedrop:viewSettings.theme` (`'day' | 'sepia' | 'night'`)
- **위치**: `viewer/src/app/globals.css` `[data-theme="..."]` 셀렉터 + View Settings 패널 컴포넌트

### 13.5.3 레이아웃 4종 (PDF Expert 의 3 + Default 추가)

PDF Expert 의 View Settings popover 상단 카드 3개 (Vertical Scroll / Horizontal Scroll / Two Pages) 그대로 차용 + 사용자 요구로 **Default = 현재 형식 (페이지 분리 X)** 4번째 추가:

```
┌────────┐ ┌────────┐
│   ≡    │ │   ▭    │
│Default │ │Vertical│
│        │ │ Scroll │
└────────┘ └────────┘
┌────────┐ ┌────────┐
│   ⇆    │ │  ▭ ▭   │
│Horiz.  │ │Two     │
│ Scroll │ │ Pages  │
└────────┘ └────────┘
```

| Layout | 스크롤 | 페이지 분리 | 사용처 |
|---|---|---|---|
| Default | 세로 (native) | 없음 (flow, 720px max-width) | 일반 doc 빠른 읽기 |
| Vertical Scroll | 세로 (native) | 종이 단위 분리 (paper-page 컴포넌트, 사이 1rem gap) | "스크롤 가능한 책" |
| Horizontal Scroll | **가상** (transform) | 1 페이지만 표시 | "PDF 류 한 페이지" |
| Two Pages | **가상** (transform) | 2 페이지 동시 표시 (서적 펼침) | "책 펼침" |

- **활성 카드 시각**: 1.5px `var(--color-accent)` border, 본문 텍스트 `accent-hover` 색, 8% 알파 accent 배경
- **사유**: PDF Expert 의 View Settings 가 가장 익숙한 4 모드 메탈모델. Default 추가는 dogfood 시 일반 마크다운 reading 도 필요 (페이지 개념 없는 노트)
- **위치**: viewer 의 layout 별 React 컴포넌트

### 13.5.4 페이지 크기 4종 (책 모드 한정, JIS B 시리즈)

- **결정**: B4 (257×364mm) / A4 (210×297) / B5 (182×257) / A5 (148×210)
- **JIS 선택 사유**: 한국 문서 관습 (B4/B5 가 ISO B 보다 흔히 쓰임 — 한국 학술지·교재 관행)
- **표시 규칙**: Default 외 모든 모드에서만 페이지 크기/마진 옵션 노출 (Default = 페이지 개념 X)
  - CSS: `body[data-layout="default"] .vs-book-only { display: none }`
- **비율 보존 (사용자 명시 강조)**: viewport-fit 시 `pageWidth = pageHeight × (dims.w / dims.h)` 강제
  - mm 단위 + scale 균등으로 비율 100% 보존
  - margin (mm) 도 같은 scale 로 px 변환
  - 사용자 명시 — "B4, A4, B5, A5의 실제 길이와 너비가 맞지 않는 것 같습니다. 비율은 꼭 맞춰야"
- **버튼 디자인** (Page sizes 4-column grid): 활성 = accent border + 8% 알파 배경 + bold

### 13.5.5 Margin 4방향 number input (Google Play Books 류)

- **결정**: 상/하/좌/우 별도 `<input type="number">` (0~60mm), 2x2 grid
- **각 input** 좌측에 화살표 아이콘 (↑↓←→) + 우측 정렬 숫자 + spinner 화살표 숨김 (`-webkit-appearance: none`)
- **사유**:
  - PDF/EPUB 표준에서 4 방향 margin 별도 설정
  - 사용자 명시 — Two Pages 는 "위아래 왼쪽 아래 4가지 다 정렬"
  - Horizontal/Two Pages 의 paper-page 가 종이처럼 보이려면 4 방향 모두 필요

### 13.5.6 가상 가로 스크롤 (Horizontal/Two Pages, "교체식" page-flip)

- **사용자 명시 핵심 요구**: "가로 스크롤 모드일 때는, 가상 스크롤 컴포넌트를 생성하고, 휠 스크롤 한번 할 때 스크롤 동작이 실제 스크롤이 아니라 교체 식으로 되어야 될 것 같습니다."
- **결정**: native browser scroll 사용 X. 다음 패턴:
  - `.page-strip` 이 모든 paper-page 를 `flex-direction: row; gap: 16px` 로 담음
  - `.entry-content` 는 `position: relative; overflow: hidden`
  - strip 은 `position: absolute; top: 50%; left: 50%`
  - JS controller 가 `transform: translate(${-groupCenter}px, -50%)` 로 *현재 그룹의 중심* 을 viewport 중심에 정확히 위치
  - wheel/keyboard → `advance(±1)` → 다음 transform 으로 슬라이드 (CSS `transition: 0.28s cubic-bezier(0.4, 0, 0.2, 1)`)
- **groupCenter 계산**:
  - Horizontal (groupSize=1): `pageW/2`, `(pageW+gap) + pageW/2`, ...
  - Two Pages (groupSize=2): `pageW + gap/2`, `2*(pageW+gap) + pageW + gap/2`, ...
- **현재 페이지 외 노출 금지** (사용자 명시 — "해당 페이지 이외에 것들이 화면에 나타나도록 하면 안"): `overflow: hidden` + 정확한 transform 으로 다른 페이지는 viewport 밖
- **wheel hijack**: `e.preventDefault()` + `dir = (deltaY > 0 || deltaX > 0) ? 1 : -1` → `advance(dir)`. shift+wheel 은 통과
- **키보드**: `→ / PageDown / Space` = 다음, `← / PageUp` = 이전, `Home/End` = 처음/끝
- **trade-off**: scroll-snap CSS 만으로는 multi-column column 단위 snap 안 되어 JS 직접 제어
- **위치**: viewer 의 horizontal/two-pages layout 컴포넌트 + `StripController` 또는 동등 React hook

### 13.5.7 Vertical Scroll 의 paper-page 컴포넌트 분리 (사용자 명시)

- **사용자 명시 핵심 요구** (이미지 #8 참조): "Vertical Scroll의 경우, 현재 하나의 긴 세로 박스에 br 형식으로 나누어져있는데, 사실 이 방식이 아니라, 용지 크기모양으로 된 세로로 여러개가 배치된 컴포넌트가 각각을 렌더링 해야 합니다."
- **결정**: JS 페이지네이션
  1. 모든 children 을 임시 `<section.paper-page>` 1개에 넣어 측정 (intended page width 적용)
  2. `flat.map(c => c.offsetHeight)` 로 라인 단위 높이 스냅샷
  3. `innerHeightPx = mmToPx(dims.h - marginTop - marginBottom)` 으로 page 당 가용 높이 계산
  4. `splitByHeight(heights, innerHeightPx)` 로 group 분배 (누적 높이 > 한계 시 새 group)
  5. 각 group 을 새 `<section.paper-page>` 로 만들어 `.entry-content` 에 차례로 append
- **paper-page CSS**:
  - `width: var(--page-width)` (예: 210mm)
  - `height: var(--page-height)` strict (overflow hidden — `min-height` 금지, 비율 보존 위해)
  - `padding` = 4 방향 마진 (mm)
  - `background: color-bg-elevated`, `border: 1px solid color-border`, `border-radius: 4px`, `box-shadow: 0 8px 24px shadow`
  - `flex-shrink: 0`
- **컨테이너** (`.entry-content`): `display: flex; flex-direction: column; align-items: center; gap: 1rem`
- **render 후 + apply (settings 변경) 후 자동 재페이지화**: `applyLayoutPagination()` 가 idempotent — 기존 paper-page 풀고 다시 분배
- **위치**: viewer 의 vertical layout 컴포넌트 (`paginateVertical` 또는 동등)

### 13.5.8 Horizontal/Two Pages 도 paper-page 컴포넌트 (사용자 명시)

- **사용자 명시** (이미지 #11 참조): "Vertical Scroll 에 적용된 컴포넌트를 Horizontal Scroll, Two Pages 에도 적용시켜야 함. 현재 Horizontal Scroll, Two Pages 는 변경해도 차이가 보이지 않고, 위 두 컴포넌트는 Vertical Scroll 때와는 다르게 페이지 위/아래에 맞춰 위아래 맞춤 정렬을 해야 합니다."
- **결정**: 같은 paper-page 컴포넌트 재사용. Horizontal/Two Pages 는 viewport-fit 으로 동적 사이즈:
  - `pageHeight = viewportH - 32` (위아래 padding)
  - `pageWidth = pageHeight × (dims.w / dims.h)` (비율 보존)
  - Two Pages 일 때 추가 제약: `widthBudget = (viewportW - gap - 64) / 2` 로 2 페이지가 viewport 너비에 들어맞게
- **paper-page 시각** (vertical 와 동일): paper bg + shadow + border + radius
- **레이아웃 차이**: Horizontal/Two Pages 는 `flex-direction: row` (vertical 은 column), strip 으로 묶어 transform 이동
- **위치**: 같은 `paginateStrip` 함수가 Horizontal + Two Pages 둘 다 처리, layout 파라미터로 분기

### 13.5.9 Page Indicator (가상 스크롤 모드 한정)

- **참조**: PDF Expert 좌하단 페이지 인디케이터 (`xxx/783` 형식 small monospace pill)
- **위치 변경**: 좌하단 → **우하단** (notedrop 의 LIVE 뱃지가 우하단에 이미 있어 통일성)
- **결정**: floating pill, 형식:
  - Horizontal: `12 / 281` (단일 숫자 + slash + total)
  - Two Pages: `12–13 / 281` (en-dash 로 pair, 마지막 페이지가 홀수면 단일 숫자)
- **CSS**: `position: fixed; bottom: 1.25rem; left: 50%; transform: translateX(-50%)`, `border-radius: 999px` (둥근 pill), `background: color-bg-elevated`, `font-variant-numeric: tabular-nums` (숫자 너비 고정)
- **갱신**: controller 의 `update()` 가 transform 갱신과 동시에 인디케이터 textContent 직접 갱신 (별도 reactive subscription 없이)
- **표시 조건**: layout `horizontal` 또는 `two-pages` 일 때만 (Default/Vertical 은 `hidden`)

### 13.5.10 헤더에 entry 제목 (Google Play Books 류)

- **사용자 명시** (이미지 #9 참조): "파일명, 제목에 해당하는 부분은 구글 사진을 참고해서, 위 헤더 부분에 보이도록 해야 합니다. 따로 렌더링 하니 이상하게 보입니다."
- **결정**: entry 본문 위에 `<h1>` 중복 제거. 헤더 (`#crumbs` 영역) 가 사실상 제목 역할
  - `font-size: 0.95rem`, `font-weight: 500`, `color: text-normal` (이전 muted 였던 것 격상)
  - `letter-spacing: -0.005em`, ellipsis 처리 (긴 제목 한 줄 유지)
  - book 모드 에서 책/챕터 구분자 = `<span class="crumb-sep">/</span>` (`color: faint`)
- **렌더 변경**: `renderShell()` 에서 `<h1 class="entry-title">` 전체 제거, 본문은 `<div class="entry-content">` 만
- **사유**: Google Play Books 의 상단 책 제목 바 — 본문 첫 줄은 컨텐츠 (성장과정 등 첫 섹션 H2). 제목 중복은 시각 잡음. 헤더가 navigation context 도 같이 제공
- **위치**: viewer 의 header + entry layout 컴포넌트

### 13.5.11 LIVE 뱃지 (preview server 한정)

- **결정**: 우하단 floating pill (page indicator 와 같은 위치, 다른 row 또는 양보)
- **상태별 색**:
  - `connected`: 녹색 `#16a34a` 배경, 흰 글자 "LIVE"
  - `updated`: 잠깐 파랑 `#0ea5e9` "updated" (800ms 후 connected 로 복귀)
  - `reconnecting`: 노랑 `#a16207` "reconnecting…"
- **표시 조건**: `isPreviewHost()` (hostname = localhost / 127.0.0.1 / 0.0.0.0) 일 때만, GH Pages 에선 EventSource 연결 시도조차 안 함 (반복 404 방지)
- **위치**: viewer 의 LiveReloadProvider 컴포넌트 (Next.js client component)

## 13.6 Race condition 방어

### 13.6.1 Render token 패턴

- **결정**: `let renderToken = 0; ++renderToken` — 진행 중인 render 가 더 새로운 render 에게 추월당하면 RAF 의 후처리 단계 skip
- **사유**: SSE 라이브 리로드 (`reload()` = loadManifest + render) 가 사용자 클릭 hashchange 와 동시 발생하면 옛 결과 (예: home) 가 새 결과 (예: entry) 를 덮어쓸 수 있음. 토큰으로 마지막 render 만 commit
- **위치**: viewer 의 routing/render 진입점

### 13.6.2 SSE reload 직렬화

- **결정**: `reloadRunning` 플래그 + `reloadPending` — 동시 SSE 이벤트 다수 와도 한 번에 1 reload 만, 추가 이벤트는 마지막 1회 더 (`do { ... } while (reloadPending)`)
- **사유**: 빠른 연속 노트 저장 (Bridge 디바운스 후 multi-emit) 시 reload 폭주 방지. 하나만 진행 + 마지막 상태 보장
- **위치**: viewer 의 LiveReloadProvider 또는 동등

### 13.6.3 StripController cleanup

- **결정**: layout 변경 시 (또는 entry-content 사라질 때) 즉시 `stripController.destroy()` — wheel/keydown listener 제거
- **사유**: home 으로 navigate 시 옛 controller 의 listener 가 잔존하면 사용자 입력 가로채임 (page nav 키가 home 에서도 작동 등)
- **위치**: `applyLayoutPagination()` 가 entry-content null check 보다 *먼저* destroy 호출

## 13.7 컨벤션 (메모리에 있어 자동 적용되지만 본 spec 에도 명문화)

- **commit 메시지**: `<gitmoji> <type>(<scope>): <한국어 subject>` (영문 금지)
- **type 10종** (Conventional Commits + gitmoji 매핑): feat ✨ / fix 🐛 / docs 📝 / chore 🔧 / refactor ♻️ / test ✅ / ci 🚀 / build 📦 / perf ⚡ / style 🎨 / release 🔖
- **특수문자 금지**: 키보드 미입력 특수문자 (em-dash —, smart quote 등) 금지. gitmoji emoji char 만 예외 허용
- **push 시점**: 사용자 명시 승인 후만 (autonomous mode 도 동일)
- **임시방편 금지**: 표면 fix 전에 "왜 이 위치에서?" 질문, 트레이드오프 함께 제시

## Related

- ADR-0025: manifest.json 위치 = repo root (BRAT)
- ADR-0026: viewer = vanilla SPA (Rejected, 2026-04-26 Next.js 로 재작성)
- ADR-0027: publish = GitHub Tree API (Accepted)
- spec §11 MVP Roadmap (M3~M6 마일스톤)
- memory `feedback_커밋_메시지_특수문자.md` (커밋 컨벤션 원본)
- memory `project_notedrop_코드맵.md` ("X 바꾸려면 어디?" + 빌드 의존 체인)
