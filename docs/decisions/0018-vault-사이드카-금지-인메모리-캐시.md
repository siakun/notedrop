---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: vault에 사이드카 파일 절대 X (frontmatter 토글만). 캐시는 인메모리 only (MVP). 파일 캐시는 v2 검토
---
# ADR-0018: Vault 사이드카 금지 + 인메모리 캐시 only

- **Status**: Accepted (2026-04-26)

## Context

플러그인이 vault 에 추가 파일 만들 가능성:
- 발행 메타 사이드카 (`<note>.notedrop.json` 같은 형태)
- 발행 로그 (vault 루트의 `.notedrop-log` 등)
- 변환 결과 캐시 (`<note>.cache.md` 등)

사용자 강한 요구: *vault 깨끗하게 유지. 추가 파일 X*.

또한 캐시 정책 결정 필요:
- 라이브 미리보기에서 같은 콘텐츠 반복 fetch 시 매번 변환 vs 캐시 사용
- 캐시 갱신 누락 시 사용자 혼란 위험

## Decision

### Vault 측 변경 = frontmatter 한 줄만

**vault 안에 추가 파일 절대 만들지 않음**. 발행 액션이 만드는 vault 변경:
1. 노트의 frontmatter 에 `notedrop-publish: true` 토글 (한 줄 추가/제거)
2. 옵션으로 `notedrop-slug`, `notedrop-cover`, `notedrop-css` 등 사용자가 명시한 키 (사용자가 직접 추가)

플러그인이 자동으로 추가하는 것은 `notedrop-publish` 만. 다른 키는 사용자가 직접 적음.

### 데이터 위치 정책

| 종류 | 위치 |
|---|---|
| 플러그인 전역 설정 (PAT, 타겟 레포, 포트, 토글) | `.obsidian/plugins/notedrop/data.json` (Obsidian saveData() 자동) |
| 페이지·책 단위 설정 (publish, render, slug, cover, css) | 그 노트 자체의 frontmatter |
| 책 단위 설정 (책 전체 적용) | 책 entry 파일 (= 폴더와 같은 이름의 .md) frontmatter |
| 캐시 (MVP) | 인메모리 (Map) only |
| 임시 작업 디렉터리 | `os.tmpdir()/notedrop-work/` (vault 밖) |

### 캐시 정책 = 인메모리 only (MVP)

라이브 미리보기에서 같은 콘텐츠 반복 fetch:

```
캐시 키:    vault 파일 경로 + mtime + transformer version
저장 위치:  Map<string, TransformedContent> (인메모리)
무효화:    vault.on('modify' | 'delete' | 'rename') → 해당 키 invalidate
플러그인 종료 시: 자동 소실 (가비지 컬렉션)
```

이유:
- 라이브 미리보기는 단일 옵시디언 세션. 재시작 시 다시 빌드해도 빠름
- 파일 캐시는 invalidation 버그 표면적 큼 (사용자 우려)
- 디스크 IO·gitignore 규칙 등 부수 비용

수동 리셋 명령어:
- `Notedrop: Clear preview cache` - 만일을 위한 안전장치

### 캐시 갱신 누락 방지

- 캐시 키에 transformer version 포함 (코드 변경 시 자동 무효화)
- vault 이벤트로 즉시 invalidate
- 외부 편집 (VSCode 등) 도 옵시디언 워처가 mtime 감지 → 자동 갱신
- 의심 시 명령어로 수동 클리어

## Consequences

긍정:
- vault 깨끗하게 유지 (프론트매터 한 줄 외 변경 X)
- 사이드카 파일 → vault git 동기 부담 0
- 캐시 invalidation 버그 표면적 작음 (인메모리 + 이벤트 기반)
- 옵시디언 종료 시 모든 임시 데이터 자동 정리

부정:
- 큰 책 (수백 챕터) 첫 빌드 시 ~수초 (캐시 없음) - 단 일회성, 이후 빠름
- 옵시디언 재시작 = 캐시 소실 (다시 빌드)

## Alternatives Considered

### 1. 사이드카 메타 파일 (`<note>.notedrop.json`)

각 발행된 노트 옆에 발행 상태·hash·통계 저장.

거부 사유:
- vault 깨끗 유지 위배
- 노트 1개당 파일 2개 → 옵시디언 검색·grep 노이즈
- frontmatter 와 사이드카 sources of truth 분리 → 동기 버그 위험

### 2. vault 루트 `.notedrop-state.json`

전체 발행 상태를 단일 JSON 파일로 vault 루트에.

거부 사유:
- vault 에 추가 파일 (위배)
- git 충돌 위험 (멀티 디바이스)
- frontmatter 가 더 명시적·안전

### 3. 파일 캐시 (`.obsidian/plugins/notedrop/cache/`)

플러그인 자체 폴더 안에 변환 캐시.

거부 사유 (MVP):
- vault 동기 도구 (Obsidian Sync, git) 가 이 폴더 같이 동기 시 문제
- gitignore 규칙 추가 부담
- invalidation 복잡

v2 검토 가능 (위치는 `os.tmpdir()/notedrop-cache/` 권장 - vault 밖).

### 4. 파일 캐시 + 명시적 cleanup 옵션

거부 사유 (MVP):
- 옵션 늘어나면 사용자 결정 부담
- MVP 는 인메모리로 단순 시작

## v2 검토 트리거

다음 중 하나 발생 시 파일 캐시 검토:
- 사용자가 매우 큰 책 (1000+ 챕터) 발행 시 시작 빌드 지연 체감
- 옵시디언 자주 재시작하는 워크플로 (현재는 그렇지 않을 듯)

## Related

- [ADR-0002](0002-발행상태-frontmatter.md) (발행 상태 = frontmatter)
- [09-cross-cutting.md](../09-cross-cutting.md) 9.1 (다층 방어)
- [09-cross-cutting.md](../09-cross-cutting.md) 9.5 (캐시 갱신 누락 방지)
