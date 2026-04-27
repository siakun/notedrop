---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: frontmatter 키는 모두 `notedrop-` prefix 강제. 다른 플러그인과 충돌 방지
---
# ADR-0003: frontmatter 키 네임스페이스 (`notedrop-` prefix)

- **Status**: Accepted (2026-04-26)

## Context

옵시디언은 모든 플러그인이 같은 frontmatter 공간을 공유. 일반 키 (`publish`, `slug`, `cover` 등) 는 다른 플러그인 (Dataview, Templater, Pretty Slug 등) 과 충돌 위험.

또한 사용자 frontmatter 에 의도된 키 (`mood`, `summary`, `# YAML 주석`) 와 플러그인 키를 명확히 구분해야 *어떤 키를 plugin 이 읽고 어떤 키를 무시하는지* 분명함.

추가로 키 이름에 *구현 디테일* (예: `realtime`) 이 박히면 미래 변경 시 마이그레이션 부담. 사용자 의도만 표현해야 함.

## Decision

**모든 frontmatter 키에 `notedrop-` prefix 강제**. `<plugin-name>-<intent>` 패턴.

플러그인이 읽는 키:

| 키 | 의미 |
|---|---|
| `notedrop-publish` | 발행 토글 |
| `notedrop-render` | 렌더 모드 (book/doc) |
| `notedrop-slug` | URL slug override |
| `notedrop-cover` | 책 표지 이미지 |
| `notedrop-css` | 페이지별 인라인 CSS |
| `notedrop-css-file` | 페이지별 CSS 파일 참조 |

플러그인이 쓰는 키:
- `notedrop-publish` 만 (Share/Unshare 토글 시)

다른 키 (사용자의 mood, custom 등) 는 변경하지 않음.

키 이름 규칙:
- 사용자 의도 표현 (`publish`, `cover`, `slug`)
- 구현 디테일 등록 안 함 (`realtime`, `incremental` 같은 단어 X)
- 소문자 + 하이픈

## Consequences

긍정:
- 다른 플러그인과 키 충돌 0
- 사용자 frontmatter 와 플러그인 키 시각적 구분 명확
- 미래 구현 변경에도 키 이름은 안정 (사용자 vault 마이그레이션 불필요)
- 검색·grep 으로 `notedrop-` 한 번에 다 찾기 쉬움

부정:
- 키 이름이 약간 길어짐 (`publish` → `notedrop-publish`)
- 사용자 입력 시 typo 가능 (자동완성 권장)

## Alternatives Considered

### 1. 단일 객체 형태 (`notedrop:` 로 묶음)

```yaml
notedrop:
  publish: true
  slug: my-page
  cover: cover.png
```

거부 사유:
- 옵시디언 properties UI 가 중첩 객체를 잘 못 다룸 (펼침 단계)
- 토글 액션 시 한 줄 추가/제거가 아니라 객체 일부 수정이 돼서 git diff 복잡
- 표준 frontmatter 도구·Dataview 와의 호환성 떨어짐

### 2. prefix 없이 일반 키 (`publish`, `slug`)

거부 사유:
- 다른 플러그인 충돌 (Pretty Slug 가 `slug` 사용 등)
- 사용자가 `publish: true` 를 적었을 때 본 플러그인 키인지 타 플러그인 키인지 식별 모호

### 3. 짧은 prefix (`nd-publish`)

거부 사유:
- 의미 불명 (사용자가 `nd-` 의 의미를 알기 어려움)
- 충돌 가능성 더 높음 (3자라 다른 플러그인이 같은 prefix 쓸 가능성)

### 4. 키에 구현 디테일 포함 (`notedrop-realtime-share`)

거부 사유:
- 미래 변경 시 마이그레이션 부담 (사용자 vault 의 모든 노트 frontmatter 갱신 필요)
- 사용자 의도가 아닌 구현 디테일을 사용자에게 노출

## Related

- [ADR-0002](0002-발행상태-frontmatter.md) (발행 상태 = frontmatter)
- [ADR-0022](0022-플러그인명-notedrop.md) (플러그인명 - prefix 의 출처)
- [07-data-model.md](../07-data-model.md) 7.6
