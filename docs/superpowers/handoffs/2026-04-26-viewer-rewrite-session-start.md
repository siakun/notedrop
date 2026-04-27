---
date: 2026-04-26
type: 핸드오프
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - viewer-rewrite
  - handoff
summary: vanilla viewer → Next.js + React + unified.js 재작성. macro 결정 명문화+ plan 완성, 다음 세션이 plan P1 부터 코드 작업 시작
---

# Notedrop viewer 재작성 — 다음 세션 시작 핸드오프

새 Claude Code 세션 첫 입력으로 전체 붙여넣기.

---

## 0. 컨텍스트

작업 디렉터리: `C:\Users\User\Documents\github_siakun\notedrop`
원격: `https://github.com/siakun/notedrop`
현재 main HEAD: 본 세션 종료 시점 commit (push 후 사용자 확인)
backup 브랜치: `backup-vanilla-viewer` (origin 에 push 됨, HEAD = `1339cc9`)

**본 세션 (2026-04-26 viewer 리팩토링) 산출물**:
- ADR-0027 (publish = GitHub Tree API): Status **Accepted** (사용자 승인). spec §5.1 IsomorphicGitClient 부분 supersede.
- ADR-0026 (viewer = vanilla SPA): Status **Rejected**. spec §5.2 + §11.1.2 + ADR-0011 표준 복귀.
- 메모리 `project_notedrop_코드맵.md` 갱신 (ADR Status 반영).
- vanilla viewer/src/app.js 마지막 주석 보강 (backup 브랜치 보존용).
- `docs/superpowers/plans/2026-04-26-viewer-rewrite.md` 작성 — P0~P8 phase 분할 + spec 공백 결정 8건 명문화.
- P0.1 (content/<hash>/index.md 직렬화 형식 사전 조사) 완료 — 시나리오 A (frontmatter 포함) 확정, ADR-0028 작성 불필요.

**본 세션 commit 이력 (예상)**:
- `66f286e` 📝 docs(adr): 0027 Accept + 0026 Reject (사용자 결정 2026-04-26)
- `1339cc9` 📝 docs(viewer): vanilla app.js 주석 보강 (폐기 전 마지막 documentation)
- (본 commit) 📝 docs(plan): viewer 재작성 plan + P0.1 사전 조사 + 다음 세션 핸드오프

## 1. 다음 세션 범위

`docs/superpowers/plans/2026-04-26-viewer-rewrite.md` 의 P1 부터 P8 까지. 시간 따라 1 세션에 P1~P3 또는 P1~P7 까지 나눌 수 있음.

**권장 분할**:
- 다음 세션 #1: P1 (스캐폴드) + P2 (lib/hooks/types) + P3 (markdown pipeline) — 의존 설치 + 테스트 가능 단위 확보
- 다음 세션 #2: P4 (markdown 컴포넌트) + P5 (viewer 컴포넌트) — UI 골격
- 다음 세션 #3: P6 (provider) + P7 (통합, main 회복) — 가장 큰 위험 phase
- 다음 세션 #4: P8 (검증 + dogfood)

**본 plan 의 main 작동 회복 boundary**: P7 끝. P1~P6 동안 main 의 plugin/main.js 는 vanilla viewer 인라인 그대로 → BRAT 사용자 dogfood 진행 OK.

## 2. 사용자 검토 필요 결정 (코드 작업 전 확인)

본 세션이 plan 에 명문화한 spec 공백 결정 8건. 다음 세션 시작 시 사용자에게 빠르게 confirm 받기 (특히 #3, #5, #7):

1. **ContentTransformer output 의 HTML 섞임**: viewer 의 unified pipeline 이 `rehype-raw` 로 HTML 패스스루 (wikilink/embed/image plugin 불필요). [plan 누락 #1]
2. **PageFrontmatter 직렬화 = frontmatter + markdown 합친 .md** (P0.1 완료, 시나리오 A 확정). [plan P0.1]
3. **Next.js dynamic route + export = manifest-driven generateStaticParams (옵션 A)**. publish 마다 viewer 재빌드 trigger. URL = `/notedrop/<hash>/`. [plan 누락 #3]
   - 대안 (옵션 B/C) 채택 시 plan P5.6 + P7.4 변경.
4. **paged.js 통합 = useEffect + dynamic import** (SSR 회피). [plan 누락 #4]
5. **Mermaid = 클라이언트 mermaid.run()** (rehype-mermaid 미사용, puppeteer 의존 회피). [plan 누락 #5]
6. **KaTeX = rehype-katex** (빌드 타임 + 클라이언트 양쪽 OK). [plan 누락 #6]
7. **PreviewServer 의 viewer 자산 인라인 = 옵션 B (zip + fflate)**. main.js 비대 (~MB) 트레이드오프. [plan P7.2]
   - 대안 (옵션 A 전부 인라인 / C 사이드카) 채택 시 plan 변경 필요.
8. **deploy.yml 신규 작성**. 현재 repo 에 없음 (release.yml 만). [plan P7.4]

## 3. 기술 결정 메타데이터

- Next.js: 14.x 라인 (App Router + `output: 'export'`)
- React: 18.x
- TypeScript: 5.x (strict)
- unified: 11.x, remark-parse 11.x, remark-gfm 4.x, remark-math 6.x, remark-rehype 11.x, rehype-raw 7.x, rehype-katex 7.x, rehype-react 8.x
- KaTeX: 0.16.x
- Mermaid: 11.x
- paged.js: 0.4.x
- 압축: fflate 0.8.x (zip) — esbuild bundle 호환 확인 필요, 안 되면 pako 폴백
- 테스트: vitest + @testing-library/react + jsdom

manifest.json schema: version=1 유지 (변경 없음)
viewer/package.json version: 0.1.25 (vanilla 마지막 0.1.24 → next.js 시작 bump)

## 4. P1 스캐폴드 직전 점검

다음 세션이 P1 시작 시 다음 사실 재확인 (코드 변경 전):

- ✅ `viewer/dist/` 가 .gitignore 에 없음 (vanilla 산출물 commit 됨) — P7 까지 건드리지 말 것 (plugin embed 가 vanilla 자산 임포트 유지)
- ✅ `plugin/src/embedded/{index.html, app.js.txt, style.css}` 가 vanilla 산출물 (`.gitignore` 확인 필요)
- ✅ `viewer/src/{index.html, app.js, style.css, ...}` 는 P1 에서 제거 또는 backup 으로 옮김
- ✅ `viewer/build.mjs` 는 P7 에서 삭제 (P1 동안은 보존하지 않아도 됨, npm scripts 만 next build 로 갈음 가능)
- ✅ `viewer/package.json` 전체 교체 (의존 + scripts)

## 5. 알려진 함정 (plan 의 §알려진 함정 옮김)

1. Next.js export + dynamic route generateStaticParams = 빌드 시 manifest 비면 [] 반환 → homepage 만 생성. 첫 publish 후 deploy.yml 가 viewer 재빌드 → entry 페이지 생성. **첫 publish 전 `/<hash>` 접근 시 404 = 의도된 동작**.
2. paged.js = `window` 의존, 'use client' + dynamic import 필수.
3. Mermaid = 페이지 진입 시 mermaid.run() + cleanup. SVG 직접 DOM 수정이라 중복 방지.
4. rehype-react typing mismatch (react@18) — types/index.d.ts 패치 또는 cast.
5. basePath 환경 분기 (`/notedrop` prod / `/` dev) — 절대 path 쓰면 깨짐. Next.js 의 basePath 자동 처리되지만 fetch URL 도 같이 의식.
6. viewer.zip 사이즈 ~수백 KB → main.js 안에 base64 ~MB. release.yml 의 main.js asset 사이즈 + Tree API blob 5MB 한계 의식.
7. fflate import = ES 모듈, esbuild cjs target 호환 확인. 안 되면 pako 폴백.
8. localStorage 페이지 사이즈 = SSR 시 undefined. usePageSize 의 read 는 useEffect 안에서.

## 6. 메모리·CLAUDE.md 규칙 (자동 로드, 강조)

- 커밋: `<gitmoji> <type>(<scope>): <한국어 subject>` 형식 (마침표 없음). em-dash 금지.
- 임시방편 금지, 구조적 원인 우선.
- TDD 가능한 한도 (단, paged.js·mermaid 같은 DOM 의존 부분은 통합 테스트 어려우니 단위 테스트 + 수동 dogfood).
- Hexagonal: viewer 도 markdown-pipeline (의존 0) ↔ components (DOM) ↔ providers (브라우저 API) 의 계층 분리.
- Push 는 사용자 명시 승인 후만 (특히 main).
- Spec macro 결정 자율 변경 금지 — plan 의 spec 결정 공백 8건은 *spec gap-filling* 이지 macro 변경 X. 단 옵션 A→B/C 변경 또는 fflate→다른 라이브러리 변경 같은 큰 트레이드오프 변경은 사용자 confirm.

## 7. 시작 명령 (다음 세션 첫 입력)

> Plan `docs/superpowers/plans/2026-04-26-viewer-rewrite.md` P1 부터 진행. 본 세션 핸드오프 (`docs/superpowers/handoffs/2026-04-26-viewer-rewrite-session-start.md`) §2 의 spec 공백 결정 8건 (특히 #3 dynamic route, #7 viewer 자산 인라인 옵션, #8 deploy.yml) 을 작업 전 사용자에게 짧게 confirm 받고 진행. P1~P3 한 세션 내 commit, P4~P5 다음 세션, P6~P7 다음 세션, P8 dogfood. main push 시점 (P7 끝) 사용자 승인. Auto mode 가정.

## 8. 본 세션 미수행 항목 + 사유

본 세션은 macro 결정 명문화(ADR Status) + plan 작성 + 사전 조사 P0.1 까지. 실 viewer 코드 0 줄 작성. 사유: spec §11.1.2 풀 기능 (KaTeX, Mermaid, paged.js, customCss 격리, 페이지 사이즈, PDF, 라이브 reload, 옵시디언 코어 풀 셋) 을 단일 세션 (수 시간) 내 구현 + 검증 어려움. 또 main 작동 가능 commit boundary (P7 끝) 까지 도달 못 하면 main 깨진 상태로 잠 → BRAT dogfood 막힘. 따라서 plan + 핸드오프로 다음 세션에 인계가 안전 결정.

dogfood 진행에 막힘 0 (main 의 vanilla viewer 가 backup-vanilla-viewer 브랜치 + main 양쪽에 살아있음). 사용자가 next 세션 시작 전까지 vanilla viewer 로 publish/dogfood 계속 가능.

다음 세션이 plan 따라 phase 단위 진행하면 viewer 풀 기능 회복 + spec 표준 복귀.
