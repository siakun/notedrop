---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: TDD 채택. Domain layer 90%+ 커버리지, 안전장치 100% 커버리지. CI 차단 의무
---
# ADR-0021: TDD + Domain layer 90% 커버리지

- **Status**: Accepted (2026-04-26)

## Context

이 프로젝트의 핵심 가치 중 하나가 *비공개 누설 방지*. 안전장치 로직에 버그 있으면 사용자 일기가 새는 사고 가능. 또한 사용자 결정 원칙:

> 즉시 동작 vs 장기 유지보수가 충돌하면 기본적으로 후자.

테스트 전략 결정 필요.

## Decision

### TDD 채택

```
1. RED:    실패하는 테스트 먼저 작성
2. GREEN:  최소 구현으로 통과
3. REFACTOR: 중복 제거, 명명 개선
4. 다음 사이클
```

특히 새 기능 / 새 안전장치 / 새 변환 규칙은 **테스트 먼저**. 구현이 테스트를 만족시키는 형태로 자연스럽게 도출.

### 커버리지 목표

| 영역 | 목표 |
|---|---|
| **Domain layer** | **90%+** (안전·정확성 핵심) |
| **안전장치 ([09](../09-cross-cutting.md) 9.7 표 모든 케이스)** | **100%** |
| Infrastructure | 70%+ |
| 전체 | 80%+ |

### CI 게이트

- 커버리지 미달 → 빌드 실패
- 안전장치 100% 미달 → 어떤 경우에도 release 차단
- skipped / .skip / .only 발견 → CI 실패 (안전장치 테스트 우회 방지)
- 새 기능 PR 마다 관련 unit 테스트 추가 의무

### 도구

- **vitest** - 빠르고 ESM 친화, 옵시디언 플러그인 ecosystem 표준
- **@types/obsidian** + 자체 fake (InMemoryVaultFs, FakeMetaCache, FakeGitClient)
- **snapshot test** - manifest.json 출력, 변환된 markdown
- **Playwright** (선택, E2E) - 뷰어 자동 테스트

### 테스트 종류 분포 (피라미드)

```
        E2E (수동·스크립트 1~2개)            ← 5%
   Integration (LocalServer, Git, Bridge)   ← 20%
Unit (Domain layer 전부, fake로 Port 주입)   ← 75%
```

대부분 unit 테스트로 검증. Domain layer 가 옵시디언 의존 없이 짜여 있어 (Hexagonal) CI 에서 옵시디언 안 켜고 돌아감.

### 안전장치 테스트 (필수, 100%)

다음 모든 케이스가 단위 테스트로 검증되어야 함:

- publish flag 없는 노트는 어떤 호출 경로로도 발행 X
- vault frontmatter 의 비-`notedrop-*` 키 (mood, summary, tags, # 주석 등) public 출력에 0건
- `%%` 주석 strip (단일 줄, 멀티 줄, 중첩)
- Waypoint 블록 strip (`%% Begin Waypoint %% ... %% End Waypoint %%`)
- 미발행 위키링크 → "(접근 권한이 없습니다)" + 빨간 스타일
- 미발행 임베드 → "접근할 수 없는 문서" placeholder
- 발행 → 미발행 전환 (alias only 케이스)
- 임베드 재귀 깊이 1 초과 → placeholder
- CSS sanitize (`@import`, `url(http*)`, `expression()`)

각 ADR 의 결정마다 그 결정을 검증하는 단위 테스트 1개 이상 보장.

## Consequences

긍정:
- 안전장치 회귀 방지 (CI 가 차단)
- 새 기능 추가 시 테스트가 명세 역할
- Domain layer 가 옵시디언 없이 빠르게 검증
- 리팩터링 안전 (테스트가 회귀 catch)

부정:
- 초기 작성 시간 약간 증가 (TDD 익숙해지면 비용 줄어듦)
- 안전장치 100% 강제 = 새 안전장치마다 테스트 필수 (좋은 부담)

## Alternatives Considered

### 1. 테스트 후 작성 (구현 → 테스트)

거부 사유:
- "테스트 다음에 짠다" 가 실제로는 안 짜지는 경향
- 안전장치 같은 critical 로직은 테스트 우선이 안전

### 2. 통합 테스트 위주 (E2E 많이)

거부 사유:
- 옵시디언 GUI 자동화 어려움
- E2E 가 느려서 CI 부담
- 단위 테스트가 산업 표준 cost-effective

### 3. 커버리지 목표 더 낮음 (60%)

거부 사유:
- 안전장치 100% 가 절대 1순위
- Domain layer 가 작아서 90% 도전 가능

### 4. 커버리지 강제 X (자율)

거부 사유:
- 사용자 강한 시그널 ("디테일 보존", "안전장치 우려")
- 자율은 "잊거나 미루는" 경향 - CI 게이트가 강제력 필요

## Related

- [10-quality-and-test.md](../10-quality-and-test.md) (전체 테스트 전략)
- [ADR-0009](0009-미발행-ref-안전장치.md) (안전장치)
- [09-cross-cutting.md](../09-cross-cutting.md) 9.1, 9.7 (다층 방어, 안전장치 표)
