---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
  - viewer
  - m4
summary: 뷰어를 Next.js 가 아닌 vanilla SPA + esbuild 로 구현. 0 의존성 빌드 + 단일 페이지 hash 라우팅 으로 0.1.0 까지 충분
---
# ADR-0026: 뷰어 = vanilla SPA (Next.js 미사용)

- **Status**: Accepted (2026-04-26)
- **Supersedes**: spec §11.1.2 의 Next.js 'output: export' 채택 (부분 변경, M3 까지 한정)
- **Superseded by**: -

## Context

spec §11.1.2 + ADR-0011 (static-spa) 은 Next.js `output: 'export'` + `'use client'` 채택. 사유는 React 생태계 + 익숙한 SPA 패턴.

M4 단계 (autonomous run, 사용자 부재) 에서 Next.js 도입을 재평가. 비교:

| 옵션 | 빌드 의존 | 라우팅 | 마크다운 | 사이즈 | 학습 곡선 |
|---|---|---|---|---|---|
| A. Next.js 14 App Router export | next + react + ts | 파일 시스템 | unified | ~150 KB JS | 익숙한 패턴, but 'use client' + export quirk |
| B. Vite + React Router | vite + react | client | unified | ~100 KB JS | React 익숙 |
| C. Vanilla JS + esbuild | esbuild + marked + DOMPurify | hash | marked | ~25 KB JS gzip | 0 |

본 프로젝트의 뷰어는:
- 루트 1 페이지 (entry list)
- 동적 1 페이지 (entry detail, book/doc 분기)
- 클라이언트 측 fetch + 렌더 (정적 호스팅 가정)
- 빌드 산출물이 GH Pages 에 deploy

= 라우트 2개, 클라이언트 데이터 패칭, 정적 호스팅. Next.js 의 SSR/SSG/ISR/RSC 어느 기능도 활용 안 됨.

## Decision

**옵션 C (vanilla JS + esbuild) 채택**. v2 에서 검색·복잡 UI 가 들어가면 React 도입 재검토.

### 구현

`viewer/src/`:
- `index.html`: 정적 entry, sticky header + `#app` shell
- `app.js`: hash 라우팅 (`#/` → home, `#/<hash>` → entry, `#/<hash>/<chapterHash>` → book chapter), manifest fetch, marked + DOMPurify 렌더
- `style.css`: 라이트 테마 (책 가독성 우선)

`viewer/build.mjs`: esbuild context (bundle, esm, target es2022, minify) + static copy (index.html, style.css, public/* → dist/).

`viewer/public/manifest.json`: 부트스트랩 1-entry (welcome). 실 publish 가 일어나면 Tree API base_tree 위에 덮어씀.

## Consequences

긍정:
- **빌드 시간 < 1초**, dist 총 크기 < 200KB (대부분 marked + DOMPurify)
- **0 React/Next.js 학습 곡선**, JS 한 파일로 라우팅·렌더 완결
- **basePath 문제 없음** — 모든 URL 이 상대 경로 + hash fragment, GH Pages 의 `/notedrop/` prefix 자동 처리
- **CI 단순** — `npm ci && npm run build` 로 정적 산출물, 별도 export 단계 불필요
- **호스팅 자유** — GH Pages, Netlify, S3, 어디든 정적 파일 그대로 배포

부정:
- **검색·복잡 UI 추가 시 재작성 부담** — v2 에서 Lunr.js 인덱스 + 검색 결과 페이지 추가하면 React 가 더 편해질 가능성
- **SEO 약함** — 클라이언트 렌더라 크롤러가 빈 셸만 봄 (spec §11.2 에서 SEO 는 v2 deferred 라 영향 적음)
- **TOC 클릭 시 인앱 라우팅만, 새로고침 시 hash 유지 OK 지만 route/<hash> 같은 실제 URL 형태 X**

## Alternatives Considered

### Next.js 14 App Router + output: 'export'

긍정: spec 의 원래 선택, 익숙한 패턴
부정:
- 'use client' + dynamic route + export 의 quirk 회피 비용 (`generateStaticParams` 의무, build 시 manifest 읽어 모든 hash 사전 생성)
- React + Next + tsx 학습/설정 시간이 autonomous run 시간을 압박
- 산출물 크기 5~10x

### Vite + React Router

긍정: 모던 SPA 표준
부정: React 도입의 가치를 본 뷰어가 회수하지 못함. v2 검색 도입 시 재평가

### Astro

긍정: 정적 사이트 + 마크다운 일급
부정: 새 도구 학습 비용, 본 프로젝트의 클라이언트 fetch 모델과 mismatch (Astro 는 빌드 타임 마크다운)

## v2 재평가 트리거

다음 중 2개 이상 충족 시 React/Next.js 로 마이그레이션 고려:
- 검색 (Lunr.js + 결과 UI)
- 댓글/피드백 위젯
- 사용자 계정 (publish 외 다른 인증 흐름)
- Mermaid·KaTeX 통합 복잡도가 vanilla 로 감당 불가

## Related

- ADR-0011: static-spa (원래 결정, 본 ADR 이 부분 supersede)
- spec §11.1.2 viewer 기능 목록
- spec §11.2 의도적 비포함 (검색·SEO)
- ADR-0025: manifest 위치 = repo root (BRAT 호환, 본 ADR 의 layout 과 동일 motivation)
