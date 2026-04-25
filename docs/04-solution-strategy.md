---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - arc42
  - strategy
summary: 전체 시스템을 결정하는 큰 전략적 선택 6개의 요약과 채택 이유. 상세는 각 ADR 참조
---
# 04. Solution Strategy

이 절은 시스템 전체 모양을 결정한 *큰* 선택을 모아둔 곳. 각 선택의 디테일·대안 비교·trade-off 는 해당 ADR 참조.

## 4.1 큰 선택 6개

### S1. Hexagonal Architecture (Ports & Adapters)

플러그인을 3-layer 로 분리: **UI → Infrastructure (Adapters) → Domain (Pure logic)**. Domain 은 옵시디언·Node API 의존 0인 순수 TypeScript. 외부 세계와는 인터페이스 (Ports) 로만 통신.

이유: 단위 테스트가 옵시디언 없이 가능. *요구사항 변경 시 몇 곳을 고치는가* 가 일관되게 적음 (Adapters 만 갈아끼우면 됨). 미래에 옵시디언 외 다른 vault 형식 지원 시 Adapter 추가만으로 가능.

상세: [decisions/0012-hexagonal-unified.md](decisions/0012-hexagonal-unified.md)

### S2. 2-레포 구조 (vault private + notedrop public)

볼트 레포 (`siakun/obsidian-personal`, private) 와 발행 레포 (`siakun/notedrop`, public) 를 분리. 플러그인이 발행 시 두 번째 레포로 git push.

이유: GH Pages 무료 티어 제약 + 사고 위험 구조적 격리. 비공개 일기가 들어 있는 레포에서 public Pages 를 쏘려면 멘탈 모델·실수 위험이 큼. 두 레포로 자르면 ‟public 레포에 들어간 것만 공개" 가 git 자체로 보장됨.

상세: [decisions/0001-2-레포-구조.md](decisions/0001-2-레포-구조.md)

### S3. Approach A - Markdown-first 발행 (플러그인 가벼움)

플러그인은 마크다운 변환 + 자산 복사 + manifest 빌드만. 페이지별 SSG 빌드는 안 함. 변환된 마크다운을 그대로 public 레포에 push 하면 GH Actions 가 정적 파일 deploy. 뷰어 (SPA) 가 런타임에 해당 마크다운을 fetch 해서 렌더.

이유: 책임 깔끔함 + public 레포 사람이 읽을 수 있는 형태 (마크다운) + 빌드 시간 ~0초 (push 후 1분 이내 live). 대안 B (JSON AST 사전 파싱), C (플러그인이 빌드까지) 모두 더 무겁고 결합도 큼.

상세: [decisions/0010-approach-a-markdown-first.md](decisions/0010-approach-a-markdown-first.md)

### S4. Static SPA 뷰어 (Next.js `output: 'export'` + `'use client'`)

뷰어는 Next.js 정적 export 로 빌드된 SPA. 빌드 시점엔 페이지 셸만 만들어지고, 런타임에 `'use client'` 컴포넌트가 manifest + content 를 fetch 해서 렌더.

이유: dev 모드와 prod 모드가 같은 코드로 작동 (모드 분기 없음, *몇 곳을 고치는가* 최소화). 라이브 미리보기에서 보던 화면이 그대로 production. SSG 페이지별 빌드 비용 없음. SEO 약간 손실은 v2 prerender 보조로 만회 가능.

상세: [decisions/0011-static-spa.md](decisions/0011-static-spa.md)

### S5. 라이브 미리보기 = 플러그인 안 Node http 서버 + SSE

`npm run dev` 같은 빌드 파이프라인 시뮬레이션 X. 뷰어는 한 번 빌드된 정적 파일이고, 플러그인은 그 파일을 서빙 + vault 콘텐츠를 on-the-fly 변환해서 응답. 파일 변경은 SSE 로 브라우저에 신호 → 브라우저가 fetch 만 다시.

이유: webpack·HMR·dev 빌드는 *뷰어 코드* 변경 대응이고, 우리 미리보기에서 변하는 건 *콘텐츠* 뿐이라 그 무게가 불필요. Node http 모듈 만으로 충분. 옵시디언 (Electron) 환경에서 안전한 패턴 (Local REST API 등 선례).

상세: [decisions/0014-라이브-미리보기-http-sse.md](decisions/0014-라이브-미리보기-http-sse.md)

### S6. Unified.js 기반 마크다운 파이프라인

뷰어의 마크다운 렌더는 unified (remark + rehype) 표준 파이프라인. 옵시디언 문법 (위키링크, 임베드, 콜아웃 등) 은 각각 remark/rehype 플러그인 1개로 모듈화.

이유: 새 문법 지원 추가 = 플러그인 1개 추가. *몇 곳을 고치는가* 가 1. mdast/hast 표준 AST 라 미래에 다른 도구 (예: MDX) 로 옮겨도 호환. 거의 모든 표준 마크다운 확장이 npm 에 plugin 으로 존재 (math, gfm, footnotes 등).

상세: [decisions/0012-hexagonal-unified.md](decisions/0012-hexagonal-unified.md)

## 4.2 이 6개 선택이 만족하는 결정 원칙

> *코드의 깔끔함은 가독성이 아니라 요구사항이 바뀌었을 때 몇 곳을 고쳐야 하는가로 판단한다.*

각 변경 시나리오에서 영향 범위:

| 시나리오 | 영향 |
|---|---|
| 옵시디언 API 일부 변경 | Adapter 1개만 (Domain 무관) |
| 새 마크다운 문법 지원 | unified plugin 1개 추가 + 뷰어 컴포넌트 1개 |
| 뷰어 UI 폴리시 (폰트, 색, 레이아웃) | 뷰어만 (콘텐츠 재발행 X - 자동 재배포만) |
| 페이지 사이즈 추가 | 프리셋 테이블 + 셀렉터 옵션 1줄 |
| Next.js 메이저 업그레이드 | 뷰어만 (플러그인 무관) |
| 다른 SSG (Vite + Lit, Astro 등) 로 교체 | 뷰어만 (콘텐츠는 마크다운 그대로) |
| 옵시디언 외 vault 형식 지원 | Adapter 추가 (Domain 그대로) |
| 새 안전장치 추가 | ContentTransformer 의 변환 단계 1곳 + 단위 테스트 |
| manifest 스키마 필드 추가 | ManifestBuilder 1곳 + version 호환 (필드 추가만이면 bump 불필요) |

거의 모든 변경이 *한 모듈 또는 한 plugin* 에 국한된다. 산탄총 수정 발생하면 설계가 잘못된 것이므로 즉시 리팩터링.

## 4.3 의도적으로 채택하지 않은 큰 안

| 대안 | 거부 이유 |
|---|---|
| 1-레포 + GitHub Pro $4/월 | 멘탈 모델 헷갈림, 사고 위험. 비용도 부담 |
| Approach B (JSON AST 사전 파싱) | AST 가 플러그인-뷰어 contract 가 됨. 양쪽 동시 변경 강제 (산탄총) |
| Approach C (플러그인이 빌드까지) | 플러그인 안에 Next.js 번들 = 수십 MB, 모바일 불가, 책임 경계 무너짐 |
| SSG (페이지마다 HTML 미리 생성) | dev/prod 모드 분기 발생, 빌드 시간 누적 |
| 노션 같은 백엔드 모델 | 비용 + 운영 부담 + 정체성 (정적 사이트가 아닌 동적 SaaS) |
| Quartz, MkDocs, Hugo 등 기존 정적 사이트 도구 차용 | 책 뷰어 (paged.js + 사이즈 선택 + PDF) 정체성 만족 어려움. 폴리시드 책 UX 가 1차 목표 |
| 옵시디언 임베드된 마크다운 미리보기 (별도 뷰어 X) | 페이지 사이즈·PDF·고급 렌더 없음. Reader 가 옵시디언 설치 없이 봐야 한다는 핵심 요구 미충족 |
