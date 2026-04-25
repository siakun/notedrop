---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: Hash 형식은 UUID v4 hex 32자 (하이픈 없음). 표준·암호학적 안전·하이픈 제거로 URL 압축
---
# ADR-0004: Hash 형식은 UUID v4 hex 32자

- **Status**: Accepted (2026-04-26)

## Context

각 발행 페이지에 immutable 한 식별자 (hash) 부여 필요. URL 의 일부 (`/<projname>/<hash>`) 로 사용. slug 가 없을 때의 기본값.

요구:
- cryptographically secure RNG (충돌·예측 불가)
- 충분한 엔트로피 (개인 vault 규모 ~ 수만 항목에서 사실상 충돌 0)
- 표준 형식 선호 (DB 호환·검증된 라이브러리)
- URL 친화적 (특수문자 X)

후보:
- nanoid (URL-safe, 21자 default, 12자 가능)
- UUID v4 (122 bits, 36자 with 하이픈, 32자 hex)
- UUID v7 (시간순 정렬, 32자 hex)

## Decision

**UUID v4, hex 32자, 하이픈 제거**.

```
crypto.randomUUID().replace(/-/g, '')
// "550e8400e29b41d4a716446655440000"
```

URL 형태:
- slug 있을 때: `siakun.github.io/notedrop/code-ai-programming`
- slug 없을 때: `siakun.github.io/notedrop/550e8400e29b41d4a716446655440000`

manifest 의 `parent`, `chapters` 는 항상 hash 사용 (slug 가 변할 수 있으므로).

## Consequences

긍정:
- 표준 형식 (RFC 4122). 모든 언어·DB 라이브러리 호환
- 122 bits 엔트로피 - 충돌 사실상 0 (10억 개 만들어도 충돌 확률 ~10^-18)
- `crypto.randomUUID()` Node 16+ 표준 (외부 라이브러리 의존 X)
- 미래에 다른 도구 (DB, GitHub API 등) 와 통합 시 자연스러움

부정:
- URL 길이 32자 (nanoid 12자 대비 길다)
- 사람이 외우기 어려움 (slug override 권장)

## Alternatives Considered

### 1. nanoid 21자 (기본)

`V1StGXR8_Z5jdHi6B-myT` 형식. 126 bits.

거부 사유:
- 외부 라이브러리 의존
- 표준 외 형식 (DB·외부 도구 호환 약함)
- 21자가 32자보다 약간 짧지만 결정적 차이 X

### 2. nanoid 12자

71 bits 엔트로피.

거부 사유:
- 엔트로피 떨어짐 (개인 vault 에서는 OK 지만 미래 OSS 배포 시 사용자별 vault 가 더 커질 수 있음)
- 표준 외 형식

### 3. UUID v4 with 하이픈 (36자)

`550e8400-e29b-41d4-a716-446655440000`.

거부 사유:
- URL 에서 하이픈 4개 더 길어짐
- URL-safe 하긴 하지만 시각적으로 더 길어 보임

### 4. UUID v7 (시간순 정렬)

생성 시각이 정렬에 반영. 데이터베이스 인덱스 효율 ↑.

거부 사유:
- 우리는 manifest 정렬을 `updatedAt` 으로 함. hash 정렬 불필요
- v7 는 아직 라이브러리 generation 표준이 분화됨 (Node 표준 X)
- v4 가 더 단순·검증됨

### 5. 임의 8자 (초기 안)

`crypto.randomBytes(6).toString('base64url')` 같은 8자.

거부 사유:
- "임의 생성" 표현 모호 + cryptographically secure 명시 어려움
- 사용자가 표준 GUID 선호 표명

## Related

- [ADR-0006](0006-url-flat-구조.md) (URL 구조)
- [07-data-model.md](../07-data-model.md) 7.1
