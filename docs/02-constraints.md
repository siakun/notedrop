---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - arc42
  - constraints
summary: 기술·비즈니스·관습·운영 제약 모음. 설계의 자유도를 좁히는 외부 조건들
---
# 02. Constraints

설계가 자유롭게 선택할 수 없는 외부 조건. 모든 의사결정은 이 목록을 만족해야 한다.

## 2.1 기술 제약

| 제약 | 영향 |
|---|---|
| **Vault 레포는 private** (`siakun/obsidian-personal`) | private 레포에서 GH Pages 무료 호스팅 불가. 별도 public 레포 필수 → 2-레포 구조 강제 |
| **GitHub Pages 무료 티어** (public 레포만, 1GB 레포 사이즈, 100GB/월 대역폭, 빌드 10분 한도) | 페이지별 SSG 빌드보다 정적 파일 직배포가 안전. 콘텐츠·자산 누적 모니터링 필요 |
| **옵시디언 플러그인 런타임** | TypeScript + esbuild 빌드, 단일 `main.js`, deps 모두 번들. 외부 네이티브 모듈 X |
| **옵시디언 데스크톱 / 모바일 차이** | 데스크톱은 Electron 의 Node.js stdlib 사용 가능 (`http`, `fs` 등). 모바일은 제한 → 라이브 미리보기 데스크톱 only (`isDesktopOnly: true`) |
| **옵시디언 MetadataCache 만 신뢰 가능 인덱스** | frontmatter 파싱 직접 구현 X (옵시디언 캐시 사용). 무거운 vault 풀스캔 회피 |
| **한국어 콘텐츠 + 한국어 파일명** | URL 슬러그 자동 생성 시 percent-encoding 발생. 사용자 override 필요 (`notedrop-slug`) |
| **Next.js 정적 export 제약** | `'use client'` SPA 패턴 권장. SSR 라우트 X. 동적 API route X (모두 빌드 시점에 결정) |
| **paged.js 런타임 비용** | ~200KB+ JS, 큰 책 (수백 챕터) 페이지네이션 시 수 초 소요 |

## 2.2 비즈니스·운영 제약

| 제약 | 영향 |
|---|---|
| **개인 프로젝트, 비용 ~0** | 유료 서비스 의존 X (GH Pages 무료, GH Actions 무료, GitHub PAT 무료). Cloudflare 등 추가 인프라 X |
| **단일 사용자 (1차)** | 멀티 사용자 동기, 권한, 공유 레벨 분리 등 설계 X |
| **OSS 가능성 (3차)** | 코드 공개 시 안전한 형태여야 함. PAT 하드코딩·개인 정보 누설 절대 X. 설정·시크릿 분리 |
| **유지보수 시간 한정** | 사용자가 본 작업(책 집필)을 더 우선. 플러그인 자체에 매주 수십 시간 못 씀. 따라서 자동화·테스트 우선, 디버깅 비용 최소화 |
| **Anthropic Claude 코드 작업 의존** | 설계·구현·리팩터링이 AI 협업으로 진행됨. 코드 구조가 *AI 가 컨텍스트에 들고 다니기 좋아야* (작은 파일, 명확한 책임, 문서화) |

## 2.3 관습 제약 (이 vault 의 컨벤션)

| 제약 | 영향 |
|---|---|
| **파일명**: `(YYYY-MM-DD) 제목.md` | 단 spec 디렉터리 하위는 정렬용 prefix `01-...md` 사용 |
| **frontmatter 종료선 다음 빈 줄 X** | `---` 다음 줄에 바로 `#` 제목 또는 본문 |
| **em-dash `—` 금지** | 하이픈 `-`, 쉼표, 괄호로 대체 |
| **태그 공백 금지** | 하이픈 사용 (`Yak-Shaving`) |
| **YAML 값 따옴표로 시작하면 홑따옴표 래핑** | `summary: '"..." 추가 텍스트'` |
| **callout / table 안 inline 백틱에 `=` 금지** | Dataview 가 inline field 로 오인 |
| **한국어 조사 앞 공백 금지** | `**bold** 를` X, `**bold**를` O |
| **AI 생성물은 `generated_by` + `ai-generated` 태그 두 마커 동시** | 본인 글과 데이터 오염 방지 |
| **LF 줄바꿈** (`.gitattributes` 강제) | 윈도 환경 작업 시에도 LF 유지 |

## 2.4 보안·프라이버시 제약 (절대 비-협상)

이 절은 다른 모든 결정을 압도한다. 충돌 시 이 절이 이김.

| 제약 | 의미 |
|---|---|
| **비공개 vault 콘텐츠 누설 0건** | 화이트리스트 강제. publish 명시적 표시 없는 모든 노트는 어떤 경로로도 public 레포에 가지 못함 |
| **vault frontmatter 의 `notedrop-*` 외 키 누설 X** | `mood`, `# YAML 주석`, 사용자 임의 키 등이 public 출력에 들어가지 못함 |
| **vault 의 다른 파일 우연한 commit X** | 작업 디렉터리는 vault 밖 (`os.tmpdir()`). plugin 코드가 vault 디렉터리에 git add 하는 경로 X |
| **PAT 하드코딩 X, 로그 출력 X** | 옵시디언 `loadData`/`saveData` 로만 보관. 콘솔·에러 메시지에 노출 X |
| **외부 자원 fetch (CSS @import, url()) 차단** | XSS·트래커 우회 방지 |

## 2.5 호환·확장 제약

| 제약 | 의미 |
|---|---|
| **옵시디언 코어 마크다운 외 플러그인 의존 문법 표시 X** | Dataview·Templater·Tasks 등의 결과는 PASSTHROUGH (= 코드블록·텍스트로 떨어짐) |
| **마크다운이 영원해야 함** | public 레포의 콘텐츠 형식은 청정 markdown + frontmatter. 미래에 Next.js 를 다른 도구로 바꿔도 콘텐츠는 그대로 |
| **manifest 스키마 호환** | `version` 필드. 호환 가능한 변경은 필드 추가만, 변경·제거는 version bump |
| **URL 영구성** | hash 는 immutable, slug 는 변경 가능하지만 hash URL 은 항상 작동해야 함 |

## 2.6 비-제약 (착각하기 쉬운 자유도)

명시적으로 *제약 아닌* 것:

- 옵시디언 community plugins 마켓 등록 (선택, v1.0 후)
- 사용자 정의 도메인 (선택, GH Pages 가 지원)
- 한국어 외 콘텐츠 (제약 X. UI 만 한국어 우선)
- 큰 vault 지원 (수만 노트 OK. PublishIndex 가 인메모리지만 frontmatter 만 들고 있어 부담 작음)
