---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - arc42
  - glossary
summary: notedrop spec 에 등장하는 용어 정의 모음. 새 onboarding 또는 외국인 독자를 위함
---
# 12. Glossary

이 spec 에 등장하는 용어 정의. 알파벳·한글 가나다 혼합 정렬 (검색 편의).

## A

**ADR (Architecture Decision Record)**
한 번의 큰 설계 결정을 작은 markdown 1개로 박제하는 패턴. Michael Nygard 2011 제안. 형식: Status / Context / Decision / Consequences / Alternatives / Related. 이 spec 의 `decisions/` 디렉터리.

**Adapter (Hexagonal)**
Port 인터페이스의 실제 구현체. 외부 시스템 (옵시디언, Node http, git) 과 Domain 사이를 연결. 예: ObsidianVaultFs 는 VaultFs Port 의 Adapter.

**arc42**
독일 SW 아키텍처 문서 표준 템플릿. 12 섹션 (Introduction → Constraints → Context → Solution Strategy → Building Blocks → Runtime → Deployment → Cross-cutting → Decisions → Quality → Risks → Glossary). 이 spec 의 메인 문서 패턴.

**Approach A**
이 프로젝트의 채택 아키텍처 안. 플러그인은 마크다운 변환만, 뷰어가 정적 SPA 로 실행 시점에 fetch 해서 렌더. B (JSON AST), C (플러그인이 빌드까지) 와 비교 후 선택. [decisions/0010](decisions/0010-approach-a-markdown-first.md)

## B

**Book mode**
책 한 권을 한 URL 에 모아 보여주는 렌더 모드. 챕터 사이드바 TOC + SPA 앵커 네비. `notedrop-render: book` 또는 Waypoint 패턴 자동 추정.

## C

**Callout**
옵시디언 콜아웃 문법. `> [!info]`, `> [!warning]`, `> [!tip]` 등. 박스 디자인된 컴포넌트로 렌더.

**Cover**
책의 첫 페이지에 표시되는 표지 이미지. `notedrop-cover` frontmatter 로 지정. 없으면 entry 본문이 1페이지.

**`'use client'`**
Next.js App Router 의 directive. 컴포넌트를 Client Component 로 표시. SSR 자체를 끄는 게 아니라, 그 컴포넌트가 클라이언트에서 hydrate 되도록 표시. `output: 'export'` 와 조합하면 Static SPA 패턴.

## D

**Doc mode**
단일 문서 렌더 모드. 사이드바 없는 paged.js 뷰어. `notedrop-render: doc` 또는 단독 .md 자동 추정.

**Domain Layer**
Hexagonal 의 핵심 계층. 옵시디언·Node API 의존 0인 순수 TypeScript 비즈니스 로직. 단위 테스트 가능. 이 프로젝트의 Domain 모듈: PublishIndex, ContentResolver, ContentTransformer, AssetCollector, BookAssembler, ManifestBuilder.

## E

**Embed**
옵시디언 임베드 문법 `![[Note]]`. 트랜스클루전: 다른 노트 본문을 그 자리에 인라인 삽입. 미발행 노트면 "접근할 수 없는 문서" placeholder.

**Entry**
manifest 의 `type: 'entry'` 항목. 홈페이지 리스트에 표시되는 페이지. 책의 entry 파일 또는 단독 doc.

## F

**Frontmatter**
마크다운 파일 상단의 YAML 메타데이터 블록. `---` 로 감싸짐. 옵시디언은 properties UI 로 표시. 이 spec 에서는:
- vault frontmatter: 사용자가 적은 원본
- output frontmatter (PageFrontmatter): public 출력용 정제본

## G

**GH Pages (GitHub Pages)**
GitHub 의 정적 사이트 호스팅. 무료 티어는 public 레포만. 1GB 레포, 100GB/월 대역폭 한도.

**GFM (GitHub Flavored Markdown)**
GitHub 마크다운 확장. 테이블, 태스크 리스트, 풋노트, 자동 링크 등 표준화. CommonMark 위에 추가.

## H

**Hash**
notedrop 의 페이지 ID. UUID v4 hex 32 자, 하이픈 없음. immutable. URL 의 일부 (slug 없을 때).

**Hexagonal Architecture (Ports & Adapters)**
Alistair Cockburn 2005 제안. 비즈니스 로직 (Domain) 을 외부 시스템 (DB, UI, 외부 API) 으로부터 인터페이스 (Ports) 로 격리하는 아키텍처. Adapter 가 Port 의 실제 구현. 테스트 용이성·교체 용이성이 핵심 가치.

**HIDE / RENDER / PASSTHROUGH**
이 프로젝트의 마크다운 렌더 정책 3-동작:
- HIDE: 파서가 의미를 이해하고 출력에서 완전 제거 (예: `%%주석%%`, frontmatter)
- RENDER: 옵시디언 의미로 풀 렌더 (예: 위키링크, 콜아웃, 수식)
- PASSTHROUGH: 파서 미구현 → 기본 마크다운으로 떨어짐 (예: ` ```dataview ` → 코드블록으로 보임)

우선순위: HIDE > RENDER > PASSTHROUGH

## I

**isomorphic-git**
순수 JavaScript 로 작성된 git 구현체. Node.js / 브라우저 둘 다에서 작동. Native git CLI 없이 git 작업 가능.

## K

**KaTeX**
LaTeX 수식 렌더링 라이브러리. MathJax 보다 가볍고 빠름. 옵시디언 코어 수식 (`$ $`, `$$ $$`) 렌더에 사용.

## M

**Manifest**
public 레포 루트의 `manifest.json`. 발행된 모든 페이지의 카탈로그 인덱스. 홈페이지·라우팅·책 사이드바 TOC 가 이 파일 1개 fetch 로 작동. 스키마: [07-data-model.md](07-data-model.md)

**MetadataCache**
옵시디언이 vault 의 frontmatter·헤딩·링크를 메모리에 색인한 자료구조. `app.metadataCache` 로 접근. 파일 수정 시 자동 갱신, `'changed'` 이벤트 발행.

**Mermaid**
다이어그램 텍스트 → SVG 렌더 라이브러리. ` ```mermaid ` 코드블록. 옵시디언 코어 지원.

**MOC (Map of Content)**
옵시디언 커뮤니티 컨벤션. 한 폴더의 콘텐츠를 wikilink 로 모아 정리한 허브 노트. 보통 `MOC.md` 파일. 이 프로젝트에선 책 챕터 추출 폴백 2순위.

## N

**nanoid**
URL-safe 랜덤 ID 생성 라이브러리. UUID 보다 짧음. 이 프로젝트는 UUID v4 채택 (nanoid 사용 X).

**Notedrop**
이 프로젝트의 플러그인 명. AirDrop 의 "툭 던지면 공유" 정체성 차용. 짧고 단어 합쳐서 발음 명확.

## O

**Obsidian**
마크다운 기반 개인 지식 관리 (PKM) 앱. Electron 위에서 동작. 플러그인 생태계 풍부.

**`output: 'export'`**
Next.js `next.config.js` 옵션. 빌드 결과를 정적 HTML/JS/CSS 파일로 export. SSR/API route 사용 X. GH Pages 같은 정적 호스팅에 deploy 가능.

## P

**paged.js**
브라우저에서 CSS Paged Media 스펙 (`@page { size: A4; }`, `break-inside: avoid`, 페이지 번호, 헤더/푸터) 을 적용해 콘텐츠를 페이지로 분할하는 라이브러리. 인쇄 출판 검증됨. 이 프로젝트의 페이지네이션 엔진.

**PAT (Personal Access Token)**
GitHub 의 개인 액세스 토큰. git push 인증에 사용. 플러그인 설정에 입력 (Obsidian saveData 에 보관, 콘솔 노출 X).

**Port (Hexagonal)**
Domain 이 외부에 요구하는 추상 인터페이스. 이 프로젝트의 Port: VaultFs, MetaCache, GitClient.

**PublishIndex**
플러그인의 인메모리 카탈로그. 발행된 모든 항목 (PublishedItem) 을 hash·path·slug 키로 조회 가능. MetadataCache 이벤트로 incremental update.

## R

**rehype**
HTML AST (hast) 를 다루는 unified 생태계 도구. mdast → hast 변환 후 rehype plugin 들로 처리. 예: rehype-katex (수식 → KaTeX HTML), rehype-react (hast → React 엘리먼트).

**remark**
마크다운 AST (mdast) 를 다루는 unified 생태계 도구. 마크다운 파싱 + 변환. 옵시디언 문법 (위키링크 등) 은 remark plugin 으로 추가.

## S

**Slug**
URL 친화적 짧은 식별자. 이 프로젝트에선 사용자가 `notedrop-slug` frontmatter 로 지정. 미지정 시 hash 가 URL 에 들어감.

**SSE (Server-Sent Events)**
서버 → 클라이언트 단방향 푸시 프로토콜. HTTP 위에서 작동. WebSocket 보다 단순. 이 프로젝트는 라이브 미리보기의 파일 변경 신호에 사용.

**Static SPA**
Next.js `output: 'export'` 로 빌드된 정적 파일이지만 클라이언트 사이드에서 라우팅·fetch 로 동적으로 작동하는 패턴. 빌드 시점에 페이지 셸만 만들고 런타임에 콘텐츠 fetch.

## T

**TDD (Test-Driven Development)**
실패 테스트 먼저 작성 → 최소 구현으로 통과 → 리팩터링 → 다음 사이클. 이 프로젝트는 TDD 채택, Domain layer 90%+ 커버리지 목표.

**Transformation pipeline**
이 프로젝트의 콘텐츠 변환 흐름: ContentResolver → ContentTransformer → AssetCollector → (발행 시) BookAssembler + ManifestBuilder + GitPublisher.

## U

**UUID v4**
Universally Unique Identifier 버전 4. 122 bits 랜덤. 형식: `550e8400-e29b-41d4-a716-446655440000`. 이 프로젝트는 하이픈 제거한 hex 32 자 사용.

**unified**
JavaScript AST 처리 ecosystem. remark (마크다운), rehype (HTML), retext (자연어) 등의 통합 인터페이스. 이 프로젝트의 마크다운 렌더 파이프라인.

## V

**Vault (옵시디언)**
옵시디언의 노트 컬렉션 디렉터리. 사용자 vault 가 한 단위. 이 프로젝트의 vault 는 `obsidian-personal` 레포.

**vitest**
Vite 기반의 빠른 JavaScript 테스트 프레임워크. ESM 친화. 이 프로젝트의 테스트 도구.

## W

**Waypoint Plugin**
옵시디언 커뮤니티 플러그인. 폴더 안에 자동 TOC 를 `%% Begin Waypoint %% ... %% End Waypoint %%` 블록으로 생성·유지. 이 프로젝트의 책 식별 패턴 (폴더 + 같은이름 .md) 의 영감.

**Wikilink**
옵시디언 위키 스타일 링크 `[[Note]]`. alias `[[Note|Display]]`, anchor `[[Note#Heading]]`, blockId `[[Note#^block]]` 지원.

## 한글

**기획서·설계서·계획서**
한국·일본 SI 전통의 문서 3분할 패턴. 이 프로젝트는 사용 안 함 (arc42 + ADR 채택). 트레이딩 봇 정찰 프로젝트는 이 패턴 사용.

**렌더 정책 3-동작**
HIDE / RENDER / PASSTHROUGH. 위 H 항목 참조.

**볼트**
Vault 의 한국어 표기. 옵시디언 노트 디렉터리 단위.

**비공개 누설**
private vault 의 노트 콘텐츠가 public 레포·웹 사이트로 의도치 않게 새어 나가는 것. 이 프로젝트의 절대 1순위 방지 대상.

**책재구성**
이 vault 의 별도 스킬 (`books/.../책재구성.md`). 강의 정제본 → 책 형태로 2차 가공. notedrop 과 별개.

**챕터 추출 3단 폴백**
책 모드에서 챕터 순서를 결정하는 알고리즘:
1. Waypoint 블록 (책 entry 파일 안 `%% Begin Waypoint %% ... %% End Waypoint %%`)
2. MOC.md (같은 폴더의 wikilink 순서)
3. 폴더 스캔 (자연 정렬, `_`/`.` 시작 파일 제외)

**화이트리스트**
notedrop 의 발행 모델. `notedrop-publish: true` 명시적으로 표시된 노트만 발행 대상. Default 는 비-발행 (안전).
