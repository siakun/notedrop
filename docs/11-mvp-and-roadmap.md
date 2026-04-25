---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - arc42
  - mvp
  - roadmap
summary: MVP 범위, v2 후보, 영구 비-목표, release readiness gate, M1 ~ M6 마일스톤
---
# 11. MVP and Roadmap

작은 MVP 로 빨리 출시 → 본인 dogfood → 사용자 피드백 → v2 확장. 본인 책 작가에게 즉시 가치 있을 것만 MVP 에.

## 11.1 MVP 범위 (v0.1.0 release)

### 11.1.1 플러그인 기능

- frontmatter `notedrop-publish` 토글 발행 ([0002](decisions/0002-발행상태-frontmatter.md))
- 책 식별 (Waypoint 패턴: 폴더 + 같은이름 .md) ([0005](decisions/0005-책-식별-waypoint-패턴.md))
- 챕터 추출 3단 폴백 (Waypoint > MOC > folder scan) ([0005](decisions/0005-책-식별-waypoint-패턴.md))
- 콘텐츠 변환 (HIDE / RENDER / PASSTHROUGH 정책 전체) ([0008](decisions/0008-렌더-3동작-tier.md))
- 미발행 ref 안전장치 (위키링크 dead link, 임베드 placeholder, 깊이 1 제한) ([0009](decisions/0009-미발행-ref-안전장치.md))
- 자산 수집·복사 (이미지 png/jpg/svg/webp/gif) ([0017](decisions/0017-자산-챕터별-분리.md))
- manifest.json + per-page md 생성
- 로컬 HTTP 서버 + SSE 라이브 미리보기 ([0014](decisions/0014-라이브-미리보기-http-sse.md))
- Git push 발행 (incremental, no pull) ([0019](decisions/0019-발행-push-only-no-pull.md))
- 명령어:
  - `Notedrop: Share this note`
  - `Notedrop: Unshare this note`
  - `Notedrop: Start preview server`
  - `Notedrop: Stop preview server`
  - `Notedrop: Clear preview cache`
  - `Notedrop: Open shared list`
  - `Notedrop: Copy share URL`
- 설정 UI:
  - GitHub PAT
  - Target repo (owner/name, default `siakun/notedrop`)
  - Local server port (default 7777)
  - "Start at Obsidian launch" 토글 (default off)
  - "Auto unpublish on file delete" 토글 (default on)
  - Preview server start/stop 토글
  - 현재 공유 항목 리스트 + URL 복사 + 공유 해제
  - `[+ Add]` 버튼 (파일 선택 → frontmatter 토글)

### 11.1.2 뷰어 기능

- Static SPA (Next.js `output: 'export'` + `'use client'`) ([0011](decisions/0011-static-spa.md))
- Public list 홈페이지 (entry 만 표시, render·title·cover 기준)
- 책 뷰어:
  - paged.js 페이지네이션
  - 챕터 사이드바 TOC
  - 챕터 앵커 네비게이션
  - 표지 페이지 (notedrop-cover 있을 때)
- 문서 뷰어 (paged.js, 사이드바 없음)
- 페이지 사이즈 선택 (A3/A4(default)/A5/B5/B6, 사이즈별 자동 폰트·여백 프리셋)
- PDF 다운로드 (`window.print()`)
- 마크다운 렌더 (옵시디언 코어 전부):
  - 표준 마크다운 + GFM
  - 위키링크, 임베드, anchor·blockId
  - 콜아웃 (`> [!info]`, `> [!warning]` 등)
  - 하이라이트 (`==text==`)
  - 수식 (`$ $`, `$$ $$`) - KaTeX
  - Mermaid
  - 이미지 사이즈 (`![[img.png\|400]]`)
  - 풋노트 (`[^1]`)
  - 블록 ID (`^id`)
  - 태스크 (`- [ ]`, `- [x]`)
- 페이지별 customCss 주입·격리 (sanitize 후) ([0016](decisions/0016-페이지-사이즈-customcss.md))
- 라이브 reload (dev mode, SSE 구독)
- Light 테마 (책 가독성 우선)

## 11.2 의도적 비포함 (v2)

지금 *안 함*. v2 에서 검토.

| 기능 | 사유 |
|---|---|
| 검색 | TOC 사이드바로 우선 충분. v2 에서 Lunr.js 클라이언트 인덱스 |
| 댓글·피드백 위젯 | MVP 외부 채널 링크만. v2 에서 Giscus 등 |
| 다크 테마 | 책 가독성 라이트 우선. v2 |
| 가로 모드 페이지 | 세로 고정. v2 |
| 사용자 정의 폰트 업로드 | customCss 로 web font 가져오는 정도 가능. v2 에서 본격 |
| 챕터별 개별 publish 토글 | 책은 entry 통일. 부분 발행은 챕터를 단독 doc 로 |
| 모바일 옵시디언 publish | HTTP 서버 미지원. 데스크톱 우선 |
| Excalidraw embed | 복잡도 높음. v2 |
| og 태그·SEO 보조 prerender | 1차 사용자(본인) SEO 비-결정적. v2 |
| 비-이미지 자산 (PDF, ZIP) | 책 한정 사용 빈도 낮음. v2 |
| Dataview 사전 렌더 | PASSTHROUGH 만. 사전 렌더는 옵시디언 호출 의존이라 어려움 |
| 노트 임베드 재귀 깊이 > 1 | 1단계로 충분 95% 케이스. 깊은 재귀는 폭주 위험 |
| 옵시디언 community plugins 마켓 등록 | v1.0 안정화 후 |
| 다국어 (한국어 외 UI) | 본인용 우선 |
| 노트 임베드의 인라인 vs 컴포넌트 선택 옵션 | 인라인 고정 |
| 자동 백업·콘텐츠 export 도구 | 마크다운이 그 자체로 export 형식 |

## 11.3 영구 비-목표 (이 프로젝트 범위 X)

다음은 v2, v3, v∞ 어느 시점에도 *목표 아님*.

- 백엔드 서버, DB, 인증, 결제
- 실시간 협업 (CRDT 등)
- 클라우드 노트 동기 (옵시디언 Sync 가 별도 존재)
- 노션·Obsidian Publish 의 그래프·백링크 위젯
- 광고 / 수익 모델
- 옵시디언 외 도구의 1급 호환 (Domain layer 구조상 가능하지만 본 프로젝트 범위 X)

## 11.4 Release readiness gate (v0.1.0)

- [ ] Domain layer 단위 테스트 커버리지 90% 이상
- [ ] 안전장치 100% 단위 테스트 (9.7 표 모든 케이스)
- [ ] 본인 책 (`코드로 배우는 AI 프로그래밍`) dogfood 1주일
- [ ] 단일 문서 발행 dogfood
- [ ] 라이브 미리보기 1시간 연속 사용 (메모리·SSE·포트 누수 없음)
- [ ] 에러 메시지 명확성 검증 (PAT 만료, 네트워크 끊김, 충돌, 잘못된 frontmatter)
- [ ] README + 설치·설정 가이드 (본인 onboarding 기준)
- [ ] 보안 점검 체크리스트 (9.8) 모두 통과

## 11.5 마일스톤

각 마일스톤은 *합격 기준* 1개 이상을 충족시키는 것으로 정의. 추정 시간은 매우 거친 안.

### M1 - Domain Layer 완성 (예상 1~2주)

목적: 옵시디언 없이도 모든 변환 로직 검증 가능한 상태.

산출물:
- Ports 정의 (VaultFs, MetaCache, GitClient)
- InMemoryVaultFs, FakeMetaCache, FakeGitClient
- Domain 모듈 6개 (PublishIndex, ContentResolver, ContentTransformer, AssetCollector, BookAssembler, ManifestBuilder)
- 단위 테스트 200+ 개, 안전장치 100%

검증: vitest 통과, 커버리지 90%+

### M2 - Infrastructure 통합 (예상 1주)

목적: Domain 을 옵시디언 환경에 연결.

산출물:
- ObsidianVaultFs, ObsidianMetaCache (Adapter)
- VaultEventBridge
- 옵시디언 플러그인 entry (`main.ts`), `manifest.json`, esbuild 빌드
- 설정 UI 기본 골격
- 명령어 등록

검증: 옵시디언에 로드, 노트 frontmatter 토글, PublishIndex 갱신 확인

### M3 - 뷰어 기본 + 라이브 미리보기 (예상 1~2주)

목적: 옵시디언에서 편집 → 브라우저에서 보임.

산출물:
- Next.js 프로젝트 셋업 (`output: 'export'`, `'use client'`)
- 페이지 라우팅 (`/`, `/[hash]`)
- 마크다운 파이프라인 (unified + 옵시디언 문법 plugin 들)
- BookViewer, DocViewer (paged.js 통합)
- LocalServer (Node http + SSE)
- 뷰어 빌드 결과를 플러그인 번들에 포함
- "Start preview" 명령어 → 브라우저에서 라이브 미리보기 작동

검증: 노트 편집 → 브라우저 자동 갱신

### M4 - Git Publish (예상 1주)

목적: GH Pages 에 실제 발행.

산출물:
- IsomorphicGitClient (또는 ChildProcessGitClient)
- GitPublisher (commit + push, mutex)
- 충돌 처리 UI
- "Share" / "Unshare" 명령어 동작
- Public 레포 생성 + GH Actions 셋업 (`.github/workflows/deploy.yml`)
- URL 클립보드 복사

검증: 발행 → 1분 내 siakun.github.io/notedrop/ 에 live

### M5 - 폴리시 + dogfood (예상 1~2주)

목적: release 품질로.

산출물:
- 페이지 사이즈 프리셋 튜닝 (실제 책 본문에 적용해서 가독성 검증)
- customCss 주입·격리·sanitize
- 표지 페이지 (notedrop-cover)
- 에러 메시지 다듬기
- 설정 UI 완성 (현재 공유 항목 리스트, [+ Add] 버튼)
- README + 가이드

검증: 본인 책 발행 → 1주일 사용

### M6 - v0.1.0 Release

산출물:
- Release readiness gate (11.4) 모두 통과
- GitHub release 1.0
- Plugin 사용 가능 상태

이후: v0.2 ~ v0.x 사용자 피드백 기반 개선 → v1.0 안정화

## 11.6 위험·완화

| 위험 | 영향 | 완화 |
|---|---|---|
| paged.js 큰 책 (수백 챕터) 시 페이지네이션 느림 | M3·M5 에서 발견 가능 | 청크 단위 lazy 페이지네이션, 또는 책당 챕터 수 한도 가이드 |
| Next.js export + 'use client' 조합에서 라우팅 quirk | M3 에서 발견 가능 | 단순 SPA 라우팅으로 폴백 (next/link 대신 자체 라우팅) |
| Obsidian Plugin 환경의 Node http 모듈 quirk | M3 에서 발견 가능 | Local REST API 플러그인 코드 참고, 선례 패턴 차용 |
| TDD 루프가 옵시디언 GUI 테스트 어려움 | M2 부터 | E2E 는 수동, automation 은 헤드리스 viewer 만 |
| Yak Shaving (vault 컨벤션·리팩터링 빠짐) | 전체 | 11.4 release gate 외엔 v2 backlog 로 보류 |
