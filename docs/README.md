---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - readme
summary: notedrop 프로젝트 spec 디렉터리 인덱스. arc42 13개 + 프로젝트 고유 1 (13-dogfood-ux) + ADR 27개 + postmortems 2건
---
# notedrop spec

옵시디언에서 GitHub Pages로 책·문서를 발행하는 플러그인 `notedrop` 의 설계 명세 모음.

## 위치·상태

- 위치 (현재): `<repo-root>/docs/` (notedrop 개발 디렉터리, plugin·viewer 코드와 동거)
- 작성일: 2026-04-26 (이후 dogfood 사이클 동안 누적 갱신)
- 상태: M1~M5 구현 완료 + dogfood (v0.1.x)
- spec 버전: 0.1 + 추가 ADR 4개 (0025/0026/0027/0028 시점)
- 플러그인 현재 버전: 0.1.44 (M5.5 dogfood 마무리)

## 문서 패턴

[arc42](https://docs.arc42.org/) 12 섹션 + [ADR (Architecture Decision Records)](https://adr.github.io/) 결정 명문화조합. 메인 문서는 *현재 상태* 를, ADR은 *왜 그렇게 됐는지의 시간 축 기록* 을 담는다. 채택 이유는 [decisions/0024-arc42-adr-문서-패턴-채택.md](decisions/0024-arc42-adr-문서-패턴-채택.md) 참조.

## 인덱스

### 메인 문서 (arc42 12 섹션 + overview)

| # | 파일 | 내용 |
|---|---|---|
| 0 | [00-overview.md](00-overview.md) | TL;DR, 핵심 결정 한눈에, 읽는 순서 |
| 1 | [01-introduction-and-goals.md](01-introduction-and-goals.md) | 목적, 1차/2차 목표, 합격 기준, 비-목표 |
| 2 | [02-constraints.md](02-constraints.md) | 기술·비즈니스·관습 제약 |
| 3 | [03-context-and-scope.md](03-context-and-scope.md) | 시스템 컨텍스트, 외부 인터페이스, in/out scope |
| 4 | [04-solution-strategy.md](04-solution-strategy.md) | 큰 전략적 선택 5개 |
| 5 | [05-building-blocks.md](05-building-blocks.md) | 컴포넌트 분해 (플러그인·뷰어), 의존 그래프 |
| 6 | [06-runtime-view.md](06-runtime-view.md) | 데이터 흐름, 시퀀스, 캐시 전략 |
| 7 | [07-data-model.md](07-data-model.md) | manifest + frontmatter 스키마, hash 형식 |
| 8 | [08-interfaces.md](08-interfaces.md) | 핵심 contract (Ports + Domain + Infrastructure) |
| 9 | [09-cross-cutting.md](09-cross-cutting.md) | 누설 방지, 에러 처리, 안전장치 횡단 |
| 10 | [10-quality-and-test.md](10-quality-and-test.md) | 테스트 전략, 품질 목표 |
| 11 | [11-mvp-and-roadmap.md](11-mvp-and-roadmap.md) | MVP 범위, v2 후보, 마일스톤 |
| 12 | [12-glossary.md](12-glossary.md) | 용어집 |
| 13 | [13-dogfood-ux-requirements.md](13-dogfood-ux-requirements.md) | dogfood 주도 UX 요구사항 (명명·UI 패턴·설정 시맨틱·영속화·race 방어) |

### ADR (27개)

`decisions/` 디렉터리. 각 ADR은 [Michael Nygard 표준 형식](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions): Status / Context / Decision / Consequences / Alternatives / Related.

| # | 파일 | 결정 |
|---|---|---|
| 0001 | [2-레포-구조](decisions/0001-2-레포-구조.md) | vault private + notedrop public, 두 레포 분리 |
| 0002 | [발행상태-frontmatter](decisions/0002-발행상태-frontmatter.md) | 발행 토글은 frontmatter에 저장 |
| 0003 | [frontmatter-네임스페이스](decisions/0003-frontmatter-네임스페이스.md) | `notedrop-*` 접두사 강제 |
| 0004 | [hash-uuid-v4-hex](decisions/0004-hash-uuid-v4-hex.md) | 32자 UUID v4 hex |
| 0005 | [책-식별-waypoint-패턴](decisions/0005-책-식별-waypoint-패턴.md) | 폴더 + 같은이름 .md, 챕터 추출 3단 폴백 |
| 0006 | [url-flat-구조](decisions/0006-url-flat-구조.md) | `/<projname>/<hash>` 평면, 책·문서 prefix 분리 X |
| 0007 | [책-1권-1url-spa-앵커](decisions/0007-책-1권-1url-spa-앵커.md) | 책은 한 URL, 챕터는 SPA 앵커 |
| 0008 | [렌더-3동작-tier](decisions/0008-렌더-3동작-tier.md) | HIDE / RENDER / PASSTHROUGH + 옵시디언 코어만 RENDER |
| 0009 | [미발행-ref-안전장치](decisions/0009-미발행-ref-안전장치.md) | 위키링크 dead link, 임베드 placeholder, 깊이 1 제한 |
| 0010 | [approach-a-markdown-first](decisions/0010-approach-a-markdown-first.md) | 플러그인은 markdown 변환만, 빌드는 GH Actions |
| 0011 | [static-spa](decisions/0011-static-spa.md) | Next.js output:export + 'use client' SPA |
| 0012 | [hexagonal-unified](decisions/0012-hexagonal-unified.md) | Hexagonal Architecture + unified.js 파이프라인 |
| 0013 | [뷰어-위치-플러그인-레포](decisions/0013-뷰어-위치-플러그인-레포.md) | 뷰어 소스는 플러그인 레포 안 (option β) |
| 0014 | [라이브-미리보기-http-sse](decisions/0014-라이브-미리보기-http-sse.md) | Node http + SSE, npm run dev 시뮬 X |
| 0015 | [미리보기-시작-수동](decisions/0015-미리보기-시작-수동.md) | 명령어 + 설정 토글로 수동 시작·중지 |
| 0016 | [페이지-사이즈-customcss](decisions/0016-페이지-사이즈-customcss.md) | 5개 사이즈 프리셋 + 페이지별 CSS |
| 0017 | [자산-챕터별-분리](decisions/0017-자산-챕터별-분리.md) | 챕터별 hash 디렉터리, 커버 frontmatter |
| 0018 | [vault-사이드카-금지-인메모리-캐시](decisions/0018-vault-사이드카-금지-인메모리-캐시.md) | vault에 추가 파일 X, 캐시 인메모리만 |
| 0019 | [발행-push-only-no-pull](decisions/0019-발행-push-only-no-pull.md) | 단순 push, 충돌 시 사용자 선택 |
| 0020 | [title-derive-summary-미사용](decisions/0020-title-derive-summary-미사용.md) | title은 파일명, summary는 안 씀 |
| 0021 | [tdd-domain-90-커버리지](decisions/0021-tdd-domain-90-커버리지.md) | TDD + Domain layer 90%+ 커버리지 |
| 0022 | [플러그인명-notedrop](decisions/0022-플러그인명-notedrop.md) | notedrop, 기본 레포명 동일 |
| 0023 | [피드백-검색-defer](decisions/0023-피드백-검색-defer.md) | MVP 미장착, v2 |
| 0024 | [arc42-adr-문서-패턴-채택](decisions/0024-arc42-adr-문서-패턴-채택.md) | 이 디렉터리 자체의 문서 패턴 결정 |
| 0025 | [manifest-위치-repo-root](decisions/0025-manifest-위치-repo-root.md) | BRAT 호환 위해 manifest/main.js/styles.css 를 repo root 에 |
| 0026 | [viewer-vanilla-spa](decisions/0026-viewer-vanilla-spa.md) | **Rejected** (2026-04-26 viewer Next.js 재작성으로 대체. spec §5.2 의 macro 결정 복귀) |
| 0027 | [publish-github-tree-api](decisions/0027-publish-github-tree-api.md) | 발행 = GitHub Git Data Tree API (isomorphic-git 미사용) |

### Postmortems

`postmortems/` 디렉터리. dogfood 사이클에서 발견된 회귀의 root cause 분석 (Anthropic engineering 표준 형식).

| 파일 | 사건 |
|---|---|
| [2026-04-27-publish-bootstrap-overwrite-bug.md](postmortems/2026-04-27-publish-bootstrap-overwrite-bug.md) | viewer.zip 의 데모 manifest.json 이 사용자 manifest 를 last-write-wins 로 덮어쓰던 버그 (v0.1.0~v0.1.39 잠재, v0.1.40 fix) |
| [2026-04-27-viewer-nextjs-migration.md](postmortems/2026-04-27-viewer-nextjs-migration.md) | vanilla SPA → Next.js + React 재작성 결정 + 이행 절차 |

## 현재 상태

- spec 은 `<repo-root>/docs/` 에 위치, plugin/viewer 코드와 동거
- M1~M5 구현 완료. M5.5 dogfood 사이클 (v0.1.31~v0.1.44) 에서 Command Pattern + Service Layer 리팩토링 + bootstrap manifest fix + viewer Hexagonal 재구성 완료
- M6 (community plugins 마켓 등재 + v1.0 안정화) 진행 중

## 작업 컨벤션 (이 디렉터리 안 모든 .md에 적용)

- frontmatter 종료선 `---` 다음 줄에 빈 줄 없이 본문 시작
- em-dash `—` 금지, 하이픈·쉼표·괄호로 대체
- 한국어 조사 앞 공백 금지 (`**bold** 를` X, `**bold**를` O)
- callout / table 안에서 `=` 포함 inline 백틱 금지
- LF 줄바꿈
- AI 생성물이므로 `generated_by: ai` 와 `tags: [ai-generated, ...]` 양쪽 명시
