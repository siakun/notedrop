---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: title은 파일명에서 derive (frontmatter 안 읽음). summary는 안 씀. tags도 안 씀
---
# ADR-0020: title 은 파일명 derive, summary·tags 미사용

- **Status**: Accepted (2026-04-26)

## Context

manifest 와 페이지 frontmatter 에 title, summary, tags 같은 표시 메타 필드를 둘지 결정 필요.

초안에서는 다 포함했다가 사용자가 정정:
- *title 은 파일명, summary 읽어도 안 씁니다*

이는 다음 원칙:
- 사용자가 *직접 작성하지 않은 정보* 를 plugin 이 자동으로 채우면 출력 quality 떨어짐
- 표시 안 할 메타는 manifest·frontmatter 에 둘 이유 없음 (저장만 noise)

## Decision

### title

플러그인이 frontmatter 에서 **읽지 않음**. 파일명에서 derive:

| 파일명 | derive title |
|---|---|
| `(2026-04-26) 트레이딩 봇 정찰 - 기획서.md` | `(2026-04-26) 트레이딩 봇 정찰 - 기획서` |
| `01. 실습 환경 준비 - VSCode와 Jupyter 확장.md` | `01. 실습 환경 준비 - VSCode와 Jupyter 확장` |
| `코드로 배우는 AI 프로그래밍.md` | `코드로 배우는 AI 프로그래밍` |

규칙:
- `.md` 확장자 제거
- 파일명 그대로 (번호 prefix, 날짜 prefix 등 보존)
- frontmatter 에 `title` 키가 있어도 plugin 은 무시

manifest item · PageFrontmatter 의 `title` 필드는 derive 결과로 채움.

### summary

플러그인이 frontmatter 에서 **읽지 않음**. manifest 에서 **제거**.

이유:
- 홈페이지 카드 미리보기에서 안 씀 (사용자 결정)
- 본문 첫 몇 줄 미리보기로 대체 가능 (필요 시 v2)

manifest item 에 summary 필드 X. PageFrontmatter 에도 X.

### tags

플러그인이 frontmatter 에서 **읽지 않음**. manifest 에서 **제거**.

이유:
- 홈페이지 필터링 기능은 v2
- 카탈로그 뷰에서 안 씀

본문 안의 인라인 `#tag` 는 RENDER 정책 ([ADR-0008](0008-렌더-3동작-tier.md)) 에 따라 일반 텍스트로 표시. (vault frontmatter tags 와 별개)

### 결과적인 manifest item (10 필드)

```ts
type ManifestItem = {
  hash:        string
  slug:        string | null
  title:       string         // 파일명 derive
  cover:       string | null
  render:      'book' | 'doc'
  type:        'entry' | 'chapter'
  parent:      string | null
  order:       number | null
  chapters:    string[] | null
  updatedAt:   string
}
```

## Consequences

긍정:
- 사용자가 frontmatter 에 메타를 추가 기재할 부담 없음 (publish 토글 + 옵션 키들만)
- manifest 작아짐 (필드 13 → 10)
- "사용자가 안 적은 정보를 plugin 이 채워서 quality 떨어지는 것" 방지
- 일관성 - 파일명이 사실상 title (옵시디언 내에서도 그렇게 보임)

부정:
- 파일명이 title 이 됨 (사용자가 title 만 따로 정하고 싶어도 불가)
- summary 카드 미리보기 약함 (홈페이지에 title + cover 만)
- tags 기반 필터·검색 v2 까지 지연

## Alternatives Considered

### 1. frontmatter 에 title 있으면 우선

```yaml
---
title: 코드로 배우는 AI 프로그래밍 (2판)
---
```

거부 사유:
- 사용자 의도와 어긋남 (title 별도 관리 안 하겠다)
- 파일명과 title 분리 → 동기 부담 (사용자가 title 안 갱신 시 stale)

### 2. summary 필드 유지 (옵션, 있으면 사용)

거부 사유:
- 사용자가 *읽어도 안 씀* 명시
- 만약 사용자가 적고 싶으면 본문 첫 단락이 자연스러움

### 3. tags 필드 유지 (필터링 v2 대비)

거부 사유:
- v2 시점이 미정이며 도래 시 추가 가능 (manifest schema 호환 변경 = 필드 추가만)
- 미리 두면 사용자 혼란 (사용처 불명)

### 4. 본문 첫 단락을 summary 로 자동 추출

거부 사유 (MVP):
- 자동 추출 quality 변동 (책 entry 의 작가의 말 첫 단락이 summary 로 적합한가?)
- 첫 단락에 위키링크·임베드 있으면 처리 부담
- v2 검토 OK

## v2 후보

- 홈페이지 카드 미리보기 강화 (자동 본문 첫 단락 추출 또는 summary 옵션 추가)
- tags 필드 추가 + 홈페이지 필터링

현 시점은 단순 시작.

## Related

- [07-data-model.md](../07-data-model.md) 7.2 (manifest 스키마 10 필드)
- [07-data-model.md](../07-data-model.md) 7.6 (frontmatter 키 명세)
- [08-interfaces.md](../08-interfaces.md) 8.4 (frontmatter 읽기/쓰기 키)
