---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: 플러그인명 = notedrop (AirDrop 차용). 기본 레포명 = notedrop (사용자 변경 가능)
---
# ADR-0022: 플러그인명 = `notedrop`, 기본 레포명도 `notedrop`

- **Status**: Accepted (2026-04-26)

## Context

다음 식별자들 결정 필요:
- 옵시디언 플러그인 표시명 (마켓 등록 시)
- frontmatter 키 prefix (`<plugin>-publish` 등)
- GitHub 레포명 (`siakun/<projname>`)
- URL slug (`siakun.github.io/<projname>/<hash>`)

요건:
- 한 단어 (사용자 선호)
- 짧고 발음 명확
- frontmatter 키로 자주 박혀도 어색 X
- 옵시디언 플러그인 마켓에 동명 플러그인 없음
- 검색 노이즈 적음
- 정체성 (책 / 발행 / 공유) 와 어울림

## Decision

### 플러그인명: `notedrop`

AirDrop 의 "툭 던지면 공유" 정체성 차용:
- "notedrop" = "note" + "drop" (AirDrop 패턴)
- 공유 액션의 즉각성을 이름에 담음
- 옵시디언 마켓 미사용 (확인 필요)
- 8자, 발음 명확
- frontmatter `notedrop-publish` 자연스러움

### 기본 레포명·URL slug = `notedrop` (사용자 변경 가능)

플러그인 설정에서 사용자가 target repo 지정. 설정 안 하면 default `siakun/notedrop`.

URL: `siakun.github.io/notedrop/<hash>`

(이전 안 `notedrop-note` 는 "note" 가 두 번 나와 redundant 라 폐기)

### frontmatter 키 prefix = `notedrop-`

[ADR-0003](0003-frontmatter-네임스페이스.md) 참조:
- `notedrop-publish`
- `notedrop-render`
- `notedrop-slug`
- `notedrop-cover`
- `notedrop-css`
- `notedrop-css-file`

## Consequences

긍정:
- 짧고 외우기 쉬움
- AirDrop 같은 친숙한 패턴
- frontmatter 키 자연스러움
- 기본 레포명 단순 (`notedrop` 그대로)

부정:
- "drop" 단어가 일반적이라 npm·GitHub 검색 시 노이즈 약간
- 다른 도구의 "notedrop" 과 헷갈릴 가능성 (큰 위험은 아님 - 옵시디언 플러그인 마켓 안에서만 unique 하면 됨)

## Alternatives Considered

### 1. `folio` (책 한 페이지)

거부 사유:
- 사용자가 `notedrop` 선호
- "folio" 의 책 정체성은 좋지만 공유·발행 정체성 약함

### 2. `tome` (큰 책)

거부 사유:
- 4자로 짧고 임팩트 있지만 발행·공유 액션 정체성 X

### 3. `paperflow`

거부 사유:
- 9자로 약간 김
- "원고가 흐르듯" 정체성은 좋지만 사용자 결정이 notedrop

### 4. `vaultshare`

거부 사유:
- "vault" 가 옵시디언 전용 단어 (다른 환경 일반화 어려움)
- 10자, 약간 김

### 5. `notedrop-note` (기본 레포명)

거부 사유:
- "note" 두 번 등장 redundant
- `notedrop` 만으로 충분

## 변경 시 마이그레이션 비용

만약 미래에 이름 변경 시:
- frontmatter 키 일괄 수정 (모든 사용자 vault 의 모든 발행 노트)
- 레포 rename (사용자 별)
- 사용자 가이드 갱신
- 옵시디언 플러그인 ID 변경 (재등록)

비용 큼. 처음에 신중히 정하고 안 바꾸는 게 좋음. `notedrop` 으로 확정.

## Related

- [ADR-0003](0003-frontmatter-네임스페이스.md) (네임스페이스)
- [00-overview.md](../00-overview.md) 핵심 결정 표
- [11-mvp-and-roadmap.md](../11-mvp-and-roadmap.md)
