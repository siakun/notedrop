---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - arc42
  - test
summary: 테스트 피라미드, Unit·Integration·E2E 전략, 도구, 커버리지 목표
---
# 10. Quality and Test Strategy

원칙: TDD. Domain layer 가 옵시디언 의존 없이 짜여 있으니 *Domain 테스트가 압도적으로 많아야* 함.

상세: [decisions/0021-tdd-domain-90-커버리지.md](decisions/0021-tdd-domain-90-커버리지.md)

## 10.1 테스트 피라미드

```
                    /─────────────\
                   /  E2E (수동·   \      ← 5%
                  /   스크립트 1~2개)\
                 /───────────────────\
                /   Integration       \   ← 20%
               /  (LocalServer, Git,   \
              /   VaultEventBridge)     \
             /───────────────────────────\
            /        Unit                 \  ← 75%
           /  (Domain layer 전부, fake로   \
          /        Port 주입)               \
         /─────────────────────────────────────\
```

## 10.2 Unit (Domain Layer)

옵시디언 미실행 상태에서도 CI 에서 작동. fake Port 로 모든 Domain 모듈 단위 테스트.

### 모듈별 핵심 시나리오

| 모듈 | 핵심 테스트 |
|---|---|
| **PublishIndex** | build / upsert / remove / rename / 챕터-부모 관계 / 이벤트 발행 / hash 충돌 재생성 |
| **ContentResolver** | 위키링크·임베드·이미지 ref 모두 해석 / anchor·blockId·alias·size 파싱 / 발행·미발행·broken 분류 |
| **ContentTransformer** | HIDE 규칙 (`%%`, frontmatter, Waypoint) / 안전장치 (각 미발행 케이스) / frontmatter 정제 (notedrop-* 외 strip) / 이미지 경로 절대화 |
| **AssetCollector** | vault 위치 찾기 (같은 폴더 → 부모 → vault search) / 자산 누락 / mime 추정 |
| **BookAssembler** | Waypoint > MOC > folder-scan 폴백 / 잘못된 형식 처리 / 챕터 순서 |
| **ManifestBuilder** | 직렬화 / omit 필드 (filePath, customCss) / 정렬 / version 필드 |

### TDD 사이클

```
1. RED:    실패하는 테스트 먼저 작성 (예: "미발행 위키링크는 빨간 dead link")
2. GREEN:  최소 구현으로 통과 (실제 변환 로직 추가)
3. REFACTOR: 중복 제거, 명명 개선, 패턴 단순화
4. 다음 테스트로
```

### 안전장치 100% 커버리지 (필수)

다음 모든 케이스가 단위 테스트로 검증되어야 함:

- publish flag 없는 노트는 어떤 호출 경로로도 발행 X
- vault frontmatter 의 비-`notedrop-*` 키 (mood, summary, tags, # 주석 등) public 출력에 0건
- `%%` 주석 strip 검증 (단일 줄, 멀티 줄, 중첩)
- Waypoint 블록 strip 검증 (`%% Begin Waypoint %% ... %% End Waypoint %%`)
- 미발행 위키링크 → "(접근 권한이 없습니다)" + 빨간 스타일
- 미발행 임베드 → "접근할 수 없는 문서" placeholder
- 발행 → 미발행 전환 (alias only 경우, alias 만 표시)
- 임베드 재귀 깊이 초과 시 placeholder
- CSS sanitize (`@import`, `url(http*)`, `expression()`)

## 10.3 Integration (Infrastructure)

옵시디언 mock 또는 실제 옵시디언 환경에서:

| 모듈 | 검증 |
|---|---|
| **LocalServer** | HTTP 라우팅 (각 경로 별 응답 형식) / SSE 송신 (이벤트 형식, 여러 클라이언트) / 정적 파일 서빙 |
| **GitPublisher** | FakeGitClient 호출 시퀀스 (clone → write → add → commit → push) / 충돌 처리 / mutex 동작 |
| **VaultEventBridge** | 옵시디언 이벤트 → PublishIndex 갱신 → SSE 송신 흐름 |

## 10.4 E2E (수동 또는 자동 스크립트)

핵심 시나리오 1~2개를 실제 환경에서:

### E2E-1: 발행 흐름

1. 옵시디언에서 새 노트 작성, frontmatter 에 `notedrop-publish: true`
2. "Notedrop: Share this note" 명령어 실행
3. Notice 확인 ("✓ 발행 완료. URL 클립보드 복사됨")
4. 클립보드 URL 으로 이동
5. 1분 이내 GH Pages 에 콘텐츠 보임
6. 페이지 사이즈 변경, PDF 다운로드 동작 확인

### E2E-2: 라이브 미리보기

1. "Notedrop: Start preview server"
2. `http://localhost:7777` 열기
3. 발행된 노트 목록 보임
4. 클릭해서 페이지 진입
5. 옵시디언으로 돌아와서 노트 편집 + 저장
6. 1초 이내 브라우저 자동 갱신 확인 (페이지 위치 유지)

E2E 자동화는 Playwright 로 가능 (옵시디언 Electron 자동화는 복잡, 수동 권장).

## 10.5 도구

| 도구 | 용도 |
|---|---|
| **vitest** | 빠르고 옵시디언 플러그인 ecosystem 표준. ESM 친화 |
| **@types/obsidian** | 타입 |
| **자체 mock + InMemory* fake** | 옵시디언 API mock |
| **Snapshot test** | manifest.json 출력, 변환된 markdown |
| **Playwright** (선택) | 뷰어 E2E |

## 10.6 커버리지 목표

| 영역 | 목표 |
|---|---|
| Domain layer | **90%+** (안전·정확성 핵심) |
| 안전장치 (9.7 표 모든 케이스) | **100%** |
| Infrastructure | 70%+ (외부 의존 많아 100% 비현실적) |
| 전체 | 80%+ |

CI 에서 커버리지 미달 시 빌드 실패. 안전장치 100% 미달은 어떤 경우에도 release 차단.

## 10.7 정성적 품질 체크 (release 전)

자동화 안 되는 부분:

- [ ] 본인 책 (`코드로 배우는 AI 프로그래밍`) 1주일 dogfood - 실제 발행, 실제 갱신, 실제 공유
- [ ] 단일 문서 발행 dogfood
- [ ] 라이브 미리보기 1시간 연속 사용 (메모리 누수, SSE 끊김, 포트 누수 검증)
- [ ] 에러 메시지 명확성 검증:
    - PAT 만료
    - 네트워크 끊김
    - 비-fast-forward 충돌
    - 잘못된 frontmatter
- [ ] README + 설치·설정 가이드 (사용자 onboarding 기준)

## 10.8 회귀 방지

- 각 ADR 의 결정마다 그 결정을 검증하는 단위 테스트 1개 이상 (예: ADR-0009 "미발행 ref 안전장치" → ContentTransformer 의 안전장치 테스트들)
- 안전장치 테스트는 절대 skip / disable 금지. CI 에서 skipped 발견 시 빌드 실패
- 새 기능 PR 마다 관련 unit 테스트 추가 의무. 미추가 시 리뷰에서 차단
