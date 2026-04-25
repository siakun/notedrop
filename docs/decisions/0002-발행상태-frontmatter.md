---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: 발행 상태(공유 ON/OFF)는 노트 자체의 frontmatter에 저장. 매니페스트나 별도 브랜치 X
---
# ADR-0002: 발행 상태는 frontmatter 에 저장

- **Status**: Accepted (2026-04-26)

## Context

사용자가 노트를 "공유" 상태로 토글했을 때 그 사실을 어디에 보존할 지 결정 필요. 후보:

A. 파일 frontmatter - 노트 자체에 `notedrop-publish: true`
B. 플러그인 매니페스트 - `.obsidian/plugins/notedrop/published.json` 같은 별도 파일
C. 별도 `published` 브랜치 - 공개 순간 cherry-pick

사용자 요구:
- 노션처럼 토글 한 번 → 공개 URL
- 멀티 디바이스 (데스크톱 여러 대) 자동 동기
- 옵시디언 외 도구로 봐도 "이 노트가 공개됐구나" 명시적

## Decision

**A 채택**: 노트 자체의 frontmatter 에 `notedrop-publish: true` 저장.

플러그인의 "Share" 명령어가 frontmatter 에 한 줄 토글. "Unshare" 가 그 줄 제거. MetadataCache 이벤트로 PublishIndex 자동 갱신.

추가:
- 외부 에디터 (VSCode 등) 로 frontmatter 수정해도 옵시디언 워처가 mtime 변화 감지 → MetadataCache 재파싱 → 같은 이벤트 발행 → 정상 작동
- frontmatter 키는 [ADR-0003](0003-frontmatter-네임스페이스.md) 의 네임스페이스 규칙 따름

## Consequences

긍정:
- 멀티 디바이스 자동 동기 (vault 깃 동기 시 frontmatter 도 따라감)
- Single source of truth (노트 자체)
- 옵시디언 외부에서도 발행 여부 명시적
- 화이트리스트 기반 - 명시적 표시 없으면 절대 발행 X (안전)
- 깃 diff 로 발행 상태 변경 이력 추적 가능

부정:
- 노트 frontmatter 에 메타 한 줄 추가됨 (사용자 콘텐츠 약간의 noise)
- frontmatter 변경 시 git diff 가 콘텐츠 변경과 섞임

## Alternatives Considered

### B. 플러그인 매니페스트

`.obsidian/plugins/notedrop/published.json` 에 `[hash, path, ...]` 리스트.

거부 사유:
- 노트 본문은 깨끗하지만 매니페스트 자체도 git 동기 필요. 결국 비슷한 noise
- 노트 보고만은 발행 여부 모름 (외부 에디터 친화 X)
- 매니페스트와 실제 frontmatter 가 어긋날 수 있음 (멀티 sources of truth)

### C. 별도 published 브랜치

발행 순간 cherry-pick 으로 `published` 브랜치에 복사. 메인 브랜치 작업 공간과 분리.

거부 사유:
- 브랜치 동기 로직 복잡 (cherry-pick 충돌 처리, 브랜치 추적)
- 발행됐던 노트의 변경 추적이 main → published 양쪽 봐야 해서 헷갈림
- 사용자 멘탈 모델 어려움

## Related

- [ADR-0003](0003-frontmatter-네임스페이스.md) (frontmatter 키 네임스페이스)
- [ADR-0018](0018-vault-사이드카-금지-인메모리-캐시.md) (vault 추가 파일 X)
- [07-data-model.md](../07-data-model.md) 7.6 (frontmatter 키 명세)
