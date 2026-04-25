---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: 뷰어는 Next.js output:'export' + 'use client' Static SPA. dev/prod 모드 분기 없음
---
# ADR-0011: 뷰어 = Static SPA (`output: 'export'` + `'use client'`)

- **Status**: Accepted (2026-04-26)

## Context

뷰어를 어떤 렌더링 패턴으로 만들지 결정. 후보:

A1. Static SPA - Next.js 정적 export 로 빌드, 클라이언트가 fetch 로 콘텐츠 로드
A2. SSG (Static Site Generation) - Next.js 가 빌드 시점에 페이지마다 HTML 미리 생성
A3. SSR - 매 요청마다 서버 렌더 (백엔드 필요)

라이브 미리보기 ([ADR-0014](0014-라이브-미리보기-http-sse.md)) 와 production 배포가 같은 코드로 작동해야 함이 핵심 제약. dev/prod 모드 분기 발생하면 관리 부담 커짐.

사용자 의문 정리:
- `'use client'` 만으로 SPA 가 되는 건 아님 (그건 컴포넌트를 client component 로 표시할 뿐)
- 진짜 SPA 비슷한 건 `output: 'export'` (정적 export) + `'use client'` 컴포넌트가 fetch 로 데이터 로드하는 패턴

## Decision

**Static SPA 패턴**:
- `next.config.js` 에 `output: 'export'`
- 페이지 컴포넌트는 `'use client'` 사용
- `useEffect` + fetch 로 manifest, content 로드
- 빌드 결과: 정적 HTML 셸 + JS 번들
- 라우팅: SPA 클라이언트 사이드

```js
// next.config.js
module.exports = { output: 'export' }
```

```tsx
// app/[hash]/page.tsx
'use client'
export default function Page({ params }) {
  const { hash } = params
  const { data: content } = useContent(hash)
  // ... paged.js 렌더
}
```

빌드:
```bash
npm run build  # 정적 HTML/JS/CSS 출력
```

배포:
- public 레포의 `viewer/` 디렉터리에 빌드 결과
- GH Actions: 빌드 결과 그대로 deploy (페이지별 SSG 빌드 X)
- 라이브 미리보기: 같은 빌드 결과를 플러그인 로컬 서버가 서빙

## Consequences

긍정:
- **dev/prod 모드 분기 없음** - 라이브 미리보기 = production. *몇 곳을 고치는가* 최소화
- 빌드 시간 ~0초 (정적 파일 그대로 배포). push = 1분 이내 live
- GH Actions 단순 (정적 파일 복사만)
- 콘텐츠 fetch 는 같은 fetch URL 로 dev (`localhost:7777/content/...`) 와 prod (`siakun.github.io/notedrop/content/...`) 둘 다 작동

부정:
- 첫 로드 시 fetch 추가 (~200ms)
- SEO 약간 손실 (Googlebot 은 JS 렌더하지만 일부 봇 못 함)
- 페이지마다 같은 HTML 셸 → og 태그 페이지별 구분 어려움 (v2 prerender 보조)

## Alternatives Considered

### A2. SSG (페이지별 HTML 미리 생성)

`getStaticPaths`, `getStaticProps` 사용. 빌드 시점에 페이지마다 HTML.

거부 사유:
- 빌드 시간 누적 (책 100챕터 ~30초)
- dev mode 와 prod mode 분기 발생 (dev: fetch 로 content, prod: filesystem 으로 content)
- *몇 곳을 고치는가* 늘어남

SEO 우위는 보조 prerender 스크립트로 만회 가능 (v2). 본인 책 특성상 SEO 가 1순위는 아님.

### A3. SSR

매 요청마다 서버 렌더. 백엔드 필요.

거부 사유:
- 백엔드 운영 부담 (제약 2.2 위배)
- GH Pages 무료 티어 안 됨

### B. 다른 SSG 도구 (Astro, 11ty, Hugo)

거부 사유:
- 사용자 친숙도 (Next.js 가 user 의 siakun.github.io 에서 이미 사용 중)
- Static SPA + paged.js + 옵시디언 문법 unified pipeline 조합은 Next.js 가 자연스러움

## 라이브 미리보기와의 관계

플러그인 로컬 HTTP 서버 ([ADR-0014](0014-라이브-미리보기-http-sse.md)) 가 같은 정적 파일 (뷰어 빌드 결과) 을 서빙 + `/content/<hash>` 엔드포인트로 vault 콘텐츠 동적 변환. 뷰어는 응답이 plugin 서버에서 오든 GH Pages 에서 오든 동일하게 동작.

## Related

- [ADR-0010](0010-approach-a-markdown-first.md) (Approach A)
- [ADR-0014](0014-라이브-미리보기-http-sse.md) (라이브 미리보기)
- [ADR-0013](0013-뷰어-위치-플러그인-레포.md) (뷰어 소스 위치)
- [04-solution-strategy.md](../04-solution-strategy.md) S4
