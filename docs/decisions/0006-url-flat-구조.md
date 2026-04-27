---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: URL은 `/<projname>/<hash>` 평면. 책·문서 prefix 분리 X. 표준 규약 없으므로 단순함을 우선
---
# ADR-0006: URL 구조 = `/<projname>/<hash>` 평면

- **Status**: Accepted (2026-04-26)

## Context

GitHub Pages 호스팅 시 URL 구조 결정 필요. 후보:

A. prefix 분리: `/notedrop/b/<book-hash>` (책) + `/notedrop/d/<doc-hash>` (문서)
B. 평면 단일: `/notedrop/<hash>` (책·문서 구분 없음)
C. vault 폴더 구조 그대로: `/notedrop/books/.../Part-1/.../` (직관적이나 폴더 구조 노출)

사용자 의문:
- `/d/` `/b/` `/c/` 가 무슨 표준인지? - *표준 아님*. 각 서비스 (Reddit /r/, YouTube /c/, Notion 해시 prefix 없음 등) 가 임의로 정함

사용자 결정:
- 단순 평면 구조 선호
- 슬러그는 hash 기본값 + frontmatter override
- 페이지가 "책" 인지 "문서" 인지는 manifest 의 render 필드로 구분, URL 에 노출 X

## Decision

**평면 단일 URL 구조**:
```
https://siakun.github.io/<projname>/<hash-or-slug>
```

`<projname>` 은 사용자가 플러그인 설정에서 지정 (default `notedrop`).
`<hash-or-slug>` 는 `notedrop-slug` frontmatter 가 있으면 slug, 없으면 hash.

홈페이지: `https://siakun.github.io/<projname>/` - 발행된 entry 목록.

책의 챕터는 자체 hash 가 있지만 ([ADR-0007](0007-책-1권-1url-spa-앵커.md)) URL 직접 노출 안 됨. 대신 책 URL 의 SPA 앵커로 네비.

## Consequences

긍정:
- URL 단순, 외우기 쉬움
- 책·문서 구분이 URL 에 박히지 않아 미래 변경 (예: 책의 일부 챕터를 단독 doc 로 분리) 자연스러움
- 사용자 멘탈 모델 단순

부정:
- 책·문서 자동 구분 못 함 (URL 만 보고는 어떤 형태인지 모름) - 단 manifest fetch 후 알게 되니 실용상 OK
- 챕터 직접 공유 불가 (책 URL + 앵커로만)

## Alternatives Considered

### A. prefix 분리 (`/b/<hash>`, `/d/<hash>`)

거부 사유:
- 추가 URL 토큰이 의미 부여 - 책·문서 구분이 URL 에 *영구 노출*
- 미래에 한 페이지의 render mode 가 바뀌면 (book → doc) URL 깨짐
- 사용자가 prefix 의미 학습 필요

### C. vault 폴더 구조 그대로

거부 사유:
- 폴더 구조 노출 (private 정보 누설 가능)
- 한국어 폴더명이 URL percent-encode 되어 가독성 저하
- vault rename 시 URL 깨짐

### D. Notion 형 짧은 hash 만 (slug 없음)

거부 사유:
- 사용자가 외우기 어려움
- SEO 안 좋음 (slug 가 키워드 표현 가능)

### E. 사용자 지정 path (`/notedrop/2026/04/notes/foo`)

거부 사유:
- 너무 자유로워서 충돌·관리 부담
- 시스템이 결정해주는 게 단순

## URL 변경 시 정책

- hash 는 immutable. 한 번 발행되면 그 hash URL 은 영구 작동
- slug 는 변경 가능. `notedrop-slug` 수정 → 다음 publish 시 새 URL 적용
  - 단 옛 slug URL 은 깨짐 (404)
  - 미래에 redirect 추가 가능 (v2)
- hash URL 은 항상 작동 (slug 가 있어도 hash 로도 접근 가능)

## Related

- [ADR-0004](0004-hash-uuid-v4-hex.md) (hash 형식)
- [ADR-0007](0007-책-1권-1url-spa-앵커.md) (책 챕터 네비)
- [07-data-model.md](../07-data-model.md) 7.4 (폴더 구조)
