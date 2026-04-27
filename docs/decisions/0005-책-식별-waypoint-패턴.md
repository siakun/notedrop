---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: 책 식별은 폴더+같은이름.md 파일 (Waypoint 컨벤션). 챕터 추출은 Waypoint > MOC > folder scan 3단 폴백
---
# ADR-0005: 책 식별은 Waypoint 패턴, 챕터 추출은 3단 폴백

- **Status**: Accepted (2026-04-26)

## Context

책 한 권 (= 폴더 + 다수의 챕터 .md) 을 어떻게 한 단위로 발행할 지 결정 필요.

후보:
A. 책 폴더 root 파일 1개만 토글, 하위 전부 자동 포함
B. root 파일 + frontmatter 에 챕터 명시 (또는 MOC 활용)
C. 챕터마다 개별 publish 플래그

사용자 vault 패턴:
- `books/<책 이름>/<책 이름>.md` (폴더와 같은 이름의 .md = entry)
- `books/<책 이름>/MOC.md` (목차 허브, wikilink 트리)
- `books/<책 이름>/Part 1/01. 제목.md` (챕터 파일들)

이 구조는 옵시디언 [Waypoint](https://github.com/IdreesInc/Waypoint) 플러그인 컨벤션과 일치 - 폴더와 같은 이름의 .md 가 그 폴더의 "스펙 문서" 역할, Waypoint 블록이 자동 TOC.

## Decision

### 책 식별 규칙

폴더 + 같은 이름의 `.md` 파일이 있고, 그 파일에 `notedrop-publish: true` + (`notedrop-render: book` 또는 폴더 패턴 자동 추정) 이면 책 entry. 폴더 자체가 책 한 권.

### 챕터 추출 3단 폴백

책 entry 가 결정되면 챕터 순서를 다음 순으로 결정:

1. **Waypoint 블록**: entry 파일 안 `%% Begin Waypoint %% ... %% End Waypoint %%` 안의 wikilink 순서. Waypoint 플러그인이 자동 유지.
2. **MOC.md**: 같은 폴더의 `MOC.md` 파일이 있으면 그 wikilink 순서 (먼저 발견된 wikilink 부터 챕터 순서 결정)
3. **폴더 스캔**: 위 둘 다 없으면 폴더의 .md 자연 정렬. `_` 또는 `.` 시작 파일, `CLAUDE.md`, `원본매핑.md`, entry 파일 자체, `MOC.md` 같은 내부 파일은 제외

각 챕터 파일은 *별개의 발행 단위* - hash·content/<hash>/index.md 따로 생성. parent = entry hash.

### 단독 문서 (책 아닌 경우)

폴더-같은이름 패턴 없이 단순히 `notedrop-publish: true` + 자동 추정으로 `notedrop-render: doc` 적용. type = entry, parent = null, chapters = null.

## Consequences

긍정:
- 사용자가 이미 쓰는 옵시디언 컨벤션 (Waypoint) 그대로 활용 - 학습 비용 0
- 한 책 발행 = entry 파일 1개 토글. UX 간단
- 챕터 추가/제거 시 별도 노력 X (Waypoint 가 자동 갱신, MOC.md 자동 동기 가능)
- 3단 폴백으로 사용자가 어느 컨벤션 쓰든 작동
- 책 entry 가 frontmatter 보유 → cover, customCss, slug 등 책 단위 설정 자연스러움

부정:
- "폴더와 같은 이름" 컨벤션 모르면 책 인식 안 됨 (가이드 필요)
- 챕터별 개별 publish 토글 안 됨 (책의 부분 발행은 챕터를 단독 doc 으로 변경해야)
- Waypoint 플러그인 설치 안 한 사용자도 작동해야 함 (MOC 또는 folder scan 폴백 필요한 이유)

## Alternatives Considered

### A. 폴더 root + 하위 전부 자동 포함

폴더 root 파일에 publish: true → 하위 .md 전부 자동 챕터.

거부 사유:
- `CLAUDE.md`, `원본매핑.md` 같은 내부 파일이 같이 발행 위험
- 챕터 순서 결정 알고리즘이 약함 (자연 정렬만)

### C. 챕터마다 개별 플래그

각 .md 에 `notedrop-publish: true` 일일이 적기.

거부 사유:
- 30챕터짜리 책이면 30번 토글 (UX 부담)
- 챕터 추가 시마다 잊을 위험
- 책 단위 설정 (cover, customCss) 위치 결정 모호

### B 변형: explicit chapters frontmatter

```yaml
notedrop-chapters:
  - "Part 1/01. 환경.md"
  - "Part 1/02. ..."
```

거부 사유:
- 사용자가 일일이 유지보수 부담
- Waypoint·MOC 와 중복

## 잘못된 frontmatter 처리

`notedrop-render` 가 정의되지 않거나 `'weird'` 같은 잘못된 값이면:
- 자동 추정 (폴더-같은이름 .md 면 'book', 아니면 'doc')
- 경고 로그 ("notedrop-render must be 'book' or 'doc'")
- 발행 자체는 계속

## Related

- [ADR-0007](0007-책-1권-1url-spa-앵커.md) (책 1권 1 URL)
- [ADR-0017](0017-자산-챕터별-분리.md) (챕터별 자산)
- [05-building-blocks.md](../05-building-blocks.md) 5.1.1 (BookAssembler)
- 외부: [Waypoint 플러그인](https://github.com/IdreesInc/Waypoint)
