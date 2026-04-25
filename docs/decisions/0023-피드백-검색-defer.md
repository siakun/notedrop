---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: 피드백 위젯·검색 기능 MVP 미장착. v2 검토. MVP는 외부 채널 링크 + TOC 사이드바로 충분
---
# ADR-0023: 피드백·검색 MVP 미장착, v2 defer

- **Status**: Accepted (2026-04-26)

## Context

사용자가 *공개해서 피드백을 받기 위해* 라고 했음. 그런데 피드백 채널·검색 기능 MVP 포함 여부는 별도 결정.

피드백 후보:
- A. Giscus (GitHub Discussions 댓글)
- B. 익명 댓글 (Cusdis 등 외부 서비스)
- C. 페이지별 폼 (Formspree 등)
- D. 외부 채널 링크만 (트위터, 이메일)
- E. 미정 / 모르겠음

검색 후보:
- 클라이언트 사이드 인덱스 (Lunr.js)
- 외부 검색 (Algolia 등)
- 미장착

사용자 결정: **E (피드백)** + **검색 미장착**.

## Decision

### 피드백 = MVP 미장착

MVP 는 페이지 푸터에 외부 채널 링크만:
- "오타·의견 보내기" → 사용자 지정 URL (트위터, 이메일, GitHub 등)

이 링크 자체도 옵션 - 설정에서 끌 수 있음.

### 검색 = MVP 미장착

책 모드는 사이드바 TOC 로 챕터 네비. 단독 doc 은 단일 페이지 검색은 브라우저 Ctrl+F 로 충분.

전문 검색 (책 본문 안 키워드 검색) 은 v2.

## Consequences

긍정:
- MVP 범위 작아짐 → 1차 release 빨라짐
- 피드백 시스템 결정 미루고 실제 사용 데이터 보고 나중에 결정 가능 (어떤 형태가 좋은지 dogfood 후)
- 외부 백엔드 의존 0 (제약 만족)
- 검색 인덱스 빌드 부담 X

부정:
- 독자가 의견 주기 약함 (외부 채널 클릭 → 폼 작성 1단계 추가)
- 책 안 검색 안 됨 (Ctrl+F 는 페이지 단위만)

## v2 트리거

다음 중 하나 발생 시 피드백·검색 검토:
- 사용자 (작가) 가 피드백 받기 진짜 어렵다고 호소
- 책 분량 커지면서 (수백 챕터) TOC 만으로 네비 어려움
- 독자 (구체 인원) 가 검색 요청

## Alternatives Considered

### A. Giscus (GitHub Discussions 댓글)

긍정: 무료, 백엔드 0, GitHub 계정 활용
부정: GitHub 계정 필요 (로그인 부담), 한국 사용자 비율 낮음

거부 사유 (MVP): 결정 미루고 dogfood 후 검토.

### B. 익명 댓글 (Cusdis 등)

긍정: 로그인 X
부정: 외부 서비스 비용·종속, 스팸 관리

거부 사유: 외부 의존 + 비용 발생 가능.

### C. 페이지별 폼

긍정: 의미 있는 피드백 위주
부정: 외부 폼 서비스 필요, 양 적음

거부 사유: MVP 외부 의존 X.

### D. 외부 채널 링크만

채택 (MVP). 푸터에 사용자 지정 링크.

### E. 검색 = Lunr.js 클라이언트 인덱스

긍정: 백엔드 없이 검색 가능
부정: 인덱스 빌드 부담 (큰 책일수록), 한국어 토크나이징 quality

거부 사유 (MVP): TOC 로 우선 충분, 인덱스 토크나이징 quality 검증 필요.

## v2 시 추천 path

**피드백**: Giscus (GitHub Discussions). 이유:
- 무료, 백엔드 0
- GitHub Pages 호스팅과 자연스럽게 어울림
- 책 독자가 개발자 (주니어~중급) 비율 높을 수 있어 GitHub 계정 보유율 OK
- 책 챕터별 댓글 섹션이 디자인적으로도 책에 어울림

**검색**: Lunr.js 클라이언트 인덱스 (한국어 토크나이저 검토). 빌드 시점에 manifest 기반 인덱스 자동 생성.

## Related

- [11-mvp-and-roadmap.md](../11-mvp-and-roadmap.md) 11.2 (v2 후보)
- [01-introduction-and-goals.md](../01-introduction-and-goals.md) 1.5 (비-목표)
