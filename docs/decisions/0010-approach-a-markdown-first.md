---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: 플러그인은 마크다운 변환만, 빌드는 GH Actions 정적 deploy. JSON AST 사전 파싱과 빌드 번들 안 함
---
# ADR-0010: Approach A - Markdown-first 발행

- **Status**: Accepted (2026-04-26)

## Context

플러그인이 어디까지 처리해서 무엇을 public 레포에 넣을지 결정 필요. 3 가지 접근법 비교:

A. Markdown-first - 플러그인은 마크다운 변환·자산 복사·manifest 빌드만. 뷰어가 SPA 로 런타임 fetch
B. JSON AST 사전 파싱 - 플러그인이 마크다운을 mdast/hast JSON 으로 미리 파싱. 뷰어는 JSON 만 받아 React 렌더
C. 플러그인이 빌드까지 - 플러그인 안에 Next.js 번들. 빌드 결과 정적 HTML 직접 push

## Decision

**A 채택**. 이유:

- 플러그인 가벼움 (옵시디언 안에서 파일 IO + git push 만)
- public 레포 사람이 읽을 수 있는 형태 (마크다운). 디버깅·grep·백업 친화
- 마크다운이 영원함 - 뷰어 (Next.js) 를 다른 도구로 바꿔도 콘텐츠는 그대로
- 뷰어 독립 진화 - UI UX 개선 시 콘텐츠 재발행 X, 자동 재배포만
- 책임 깔끔: 플러그인 = 콘텐츠 변환, 뷰어 = 표시

플러그인이 하는 일:
1. MetadataCache 로 발행 매니페스트 메모리 색인 갱신
2. 위키링크/임베드 해석 (발행 → hash, 미발행 → 안전장치)
3. HIDE 정책 적용
4. 청정 마크다운 + 자산 + 매니페스트를 public 레포에 commit·push

뷰어가 하는 일:
1. manifest.json fetch
2. 페이지 클릭 시 /content/<hash>/index.md fetch
3. unified.js 로 파싱 → paged.js 로 페이지네이션 → 렌더

## Consequences

긍정:
- 변경 영향 범위 최소:
  - 뷰어 UI 개선 → 뷰어만 (자동 재배포)
  - 새 옵시디언 문법 → 플러그인 + 뷰어 (각각 독립)
  - Next.js → 다른 SSG 마이그 → 뷰어만 (마크다운 그대로)
  - 콘텐츠 백업 → git clone 끝
- 사용자 (작가) 가 public 레포 들여다봐도 마크다운 그대로 읽을 수 있음

부정:
- 뷰어가 런타임에 markdown 파서 실행 - 첫 로드 시 ~300ms 추가
- public 레포 사이즈가 콘텐츠 + 자산으로 누적 (GH 1GB 한도 모니터링 필요)

## Alternatives Considered

### B. JSON AST 사전 파싱

플러그인이 마크다운을 mdast/hast JSON 으로 파싱해서 보냄.

거부 사유:
- AST 가 플러그인-뷰어 contract 가 됨. 양쪽 동시 변경 강제 (산탄총 수정)
- JSON 은 사람이 못 읽음 (백업·디버깅 가치 X)
- 플러그인 코드가 커짐 (전체 옵시디언 마크다운 파서를 플러그인 안에)
- 비대칭 의존 - 플러그인 변경이 뷰어 강제 변경 ↔ A 는 마크다운 표준이라 양쪽 독립

빌드 빠름 장점은 책 100챕터 기준 ~30초 차이라 결정적이지 않음. A 의 깔끔함이 압도.

### C. 플러그인이 빌드까지

플러그인 안에 Node.js + Next.js + 모든 deps 번들. 빌드 결과 정적 HTML 직접 push.

거부 사유:
- 플러그인 크기 폭발 (수십~수백 MB)
- 모바일 옵시디언 불가
- 뷰어 업데이트 시 플러그인 업데이트 + 모든 콘텐츠 재발행
- 옵시디언 (Electron) 환경에서 빌드 파이프라인 돌리는 게 안티 패턴
- 책임 경계 무너짐 (플러그인 = 콘텐츠 + 빌드 + 배포 다 함)

## 변경 시나리오 비교 (A 의 우월성)

| 변경 | A (Markdown-first) | B (JSON AST) | C (플러그인 빌드) |
|---|---|---|---|
| 뷰어 UI 개선 (폰트·색) | 뷰어만 → 자동 재빌드 | 뷰어만 | **플러그인 전체 + 모든 콘텐츠 재발행** |
| 새 옵시디언 문법 지원 | 플러그인 + 뷰어 (독립) | **플러그인(파서) + 뷰어(렌더러) 동시** ← contract 깨짐 | 플러그인만 (변환·빌드 둘 다) |
| Next.js → 다른 SSG | 뷰어만 교체, 마크다운 그대로 | 뷰어 + AST 호환 작업 | 플러그인 + 빌드 파이프라인 전체 교체 |
| 콘텐츠 백업·이전 | git clone 끝 | JSON → 변환 도구 필요 | 빌드 결과만, 소스 X |

## Related

- [ADR-0011](0011-static-spa.md) (Static SPA 뷰어)
- [ADR-0019](0019-발행-push-only-no-pull.md) (push only)
- [04-solution-strategy.md](../04-solution-strategy.md) S3, 4.3
