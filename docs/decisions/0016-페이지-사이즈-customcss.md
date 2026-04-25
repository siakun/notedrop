---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: 페이지 사이즈 5개 프리셋 (A3/A4/A5/B5/B6). 페이지별 customCss 인라인 또는 파일 참조 지원
---
# ADR-0016: 페이지 사이즈 프리셋 + 페이지별 customCss

- **Status**: Accepted (2026-04-26)

## Context

뷰어가 책에 어울리는 폴리시드 페이지 UX 제공해야. 핵심:

1. 페이지 사이즈 선택 (A4 만 X, 사용자가 고를 수 있게)
2. 페이지별 디자인 customizable (책마다 다른 스타일)

paged.js 가 CSS Paged Media 스펙으로 페이지 분할. `@page { size: A4; }` 같은 표준 CSS 사용.

## Decision

### 페이지 사이즈 = 5 프리셋

| 사이즈 | 치수 | 용도 |
|---|---|---|
| A3 | 297 × 420 mm | 큰 도면·이미지 |
| **A4 (default)** | 210 × 297 mm | 표준 |
| A5 | 148 × 210 mm | 컴팩트 |
| B5 | 176 × 250 mm | 일본·아시아 도서 표준 |
| B6 | 125 × 176 mm | 작은 책 |

각 사이즈마다 자동 적용:
- 폰트 크기 (사이즈에 비례)
- 줄 높이
- 여백 (margin)
- 코드블록 폰트 사이즈

페이지 방향은 **세로 고정** (가로 모드는 v2).

뷰어 우상단 드롭다운으로 사이즈 선택. localStorage 에 저장.

### 페이지별 customCss

frontmatter 두 가지 키 지원:

```yaml
---
notedrop-publish: true
notedrop-render: book
# 인라인
notedrop-css: |
  .page { font-family: 'Noto Serif KR'; }
  .heading { color: #333; }
# 또는 vault 파일 참조
notedrop-css-file: "_styles/my-book.css"
---
```

둘 다 있으면 합쳐짐 (file 먼저, 인라인 나중에 → 인라인이 override).

### CSS 격리 (페이지별)

뷰어가 SPA 라 다음 페이지 이동해도 이전 페이지 CSS 가 남으면 안 됨. 격리 방법:
- 페이지 진입 시 `<style data-page-hash="aB3xK9">CSS</style>` 주입
- 떠날 때 해당 style 엘리먼트 제거
- best-effort scoping: `.notedrop-content` prefix 자동 부여

### CSS Sanitize (보안)

다음 패턴 자동 strip:
- `@import` (외부 URL fetch)
- `url(http*)` 또는 `url(//*)` (외부 리소스)
- `expression()` (legacy IE, XSS 위험)
- `<style>` 태그 안에 `<script>` 인젝션

경고 로그 출력. 발행 자체는 계속.

## Consequences

긍정:
- 사용자가 책마다 다른 스타일 (전통적 책 vs 모던 매뉴얼) 표현 가능
- A4 외 다른 사이즈 선택으로 다양한 책 형태 (B6 컴팩트 가이드 등)
- CSS 가 frontmatter 또는 파일로 모두 가능 (단순 vs 재사용)
- 격리로 다른 페이지 영향 차단

부정:
- CSS 보안 우려 (sanitize 로 mitigation)
- 프리셋 5개로 시작, 사용자 정의 사이즈는 v2

## Alternatives Considered

### 1. 사이즈 1개 고정 (A4)

거부 사유:
- 책마다 적합 사이즈 다름
- 세계 표준 (A 시리즈 + B 시리즈) 필요

### 2. 사용자 자유 입력 (mm 단위)

거부 사유:
- UX 복잡 (드롭다운 vs 텍스트 입력)
- 검증 부담
- v2 검토

### 3. CSS 미지원 (전역 테마만)

거부 사유:
- 책마다 다른 톤 표현 못 함
- 작가의 디자인 자유도 제한

### 4. CSS 격리 X (전역 영향 허용)

거부 사유:
- 다음 페이지에 이전 책 CSS 가 영향 (사용자 혼란)
- SPA 네비게이션 시 CSS 누적 위험

## v2 후보

- 사용자 정의 사이즈 (mm 입력)
- 가로 모드 페이지
- 사용자 정의 폰트 업로드
- CSS 변수 (`--notedrop-font-size` 등) 노출로 사용자가 부분 override

## Related

- [07-data-model.md](../07-data-model.md) 7.6 (frontmatter 키)
- [09-cross-cutting.md](../09-cross-cutting.md) 9.5 (CSS 위험 패턴)
- [11-mvp-and-roadmap.md](../11-mvp-and-roadmap.md) 11.1.2 (뷰어 기능)
