---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - arc42
  - data-model
summary: manifest.json 스키마, per-page md frontmatter 스키마, hash 형식, 폴더 구조, 버전 관리
---
# 07. Data Model

이 절은 *public 출력* 의 데이터 형태를 정한다. 플러그인 내부 표현은 [08-interfaces.md](08-interfaces.md) 참조.

## 7.1 Hash 형식

| 항목 | 결정 |
|---|---|
| 형식 | UUID v4, hex 32 자, 하이픈 없음 |
| 예시 | `550e8400e29b41d4a716446655440000` |
| 생성 | Node `crypto.randomUUID()` 결과에서 하이픈 제거 |
| 불변성 | 한 번 부여되면 변경 X (URL 영구성) |
| 충돌 | 122 bits 엔트로피 - 사실상 0 확률. 발견 시 재생성 (PublishIndex 검사) |

slug 는 별도. `notedrop-slug` frontmatter 로 사용자 override. URL 에선 slug 우선:

- slug 있음: `siakun.github.io/notedrop/code-ai-programming`
- slug 없음: `siakun.github.io/notedrop/550e8400e29b41d4a716446655440000`

내부 매니페스트의 `parent`, `chapters` 는 항상 hash 사용 (slug 가 변할 수 있으므로).

상세: [decisions/0004-hash-uuid-v4-hex.md](decisions/0004-hash-uuid-v4-hex.md)

## 7.2 manifest.json 스키마

**역할**: public 레포 루트의 카탈로그 인덱스. 홈페이지 리스트, 라우팅, 책 모드 사이드바 TOC 가 이 파일 1개 fetch 로 작동.

```ts
type Manifest = {
  version:     1                     // 스키마 버전, 호환 깨질 때만 bump
  generatedAt: string                // ISO 8601 - 이 매니페스트 작성 시각
  generatedBy: string                // "notedrop-plugin@0.1.0"
  items:       ManifestItem[]
}

type ManifestItem = {
  // 식별
  hash:        string                // UUID v4 hex 32, immutable
  slug:        string | null         // 사용자 override
  
  // 표시
  title:       string                // 파일명에서 derive (확장자·번호 prefix 제거)
  cover:       string | null         // 절대 경로, 예: "/content/<hash>/_assets/cover.png"
  
  // 구조
  render:      'book' | 'doc'        // notedrop-render 또는 자동 추정
  type:        'entry' | 'chapter'   // entry 만 홈페이지 리스트 표시
  parent:      string | null         // chapter 라면 책 entry hash
  order:       number | null         // chapter 순서 (101 = Part 1 ch 1, 205 = Part 2 ch 5)
  chapters:    string[] | null       // entry 이고 render=book 이면 챕터 hash 순서 배열
  
  // 타임스탬프
  updatedAt:   string                // 가장 최근 publish 시각
}
```

**필드 10 개**. summary, tags, publishedAt, customCss, filePath 모두 의도적 제외:

- `summary` / `tags`: 카탈로그 뷰에서 안 씀 (사용자 결정 - title + cover 만으로 충분)
- `publishedAt`: 정렬은 updatedAt 으로 충분
- `customCss`: 페이지 렌더 시점에만 필요. per-page md frontmatter 로 이동
- `filePath`: vault 내부 경로. public 노출 위험 방지

### 예시

```json
{
  "version": 1,
  "generatedAt": "2026-04-26T15:30:00Z",
  "generatedBy": "notedrop-plugin@0.1.0",
  "items": [
    {
      "hash": "550e8400e29b41d4a716446655440000",
      "slug": "code-ai-programming",
      "title": "코드로 배우는 AI 프로그래밍",
      "cover": "/content/550e8400e29b41d4a716446655440000/_assets/book-cover.png",
      "render": "book",
      "type": "entry",
      "parent": null,
      "order": null,
      "chapters": [
        "0c5b9e6a4f9e4e1f8b6a3d2c1e0f9d8c",
        "1d6caf7b5a0f5f2g9c7b4e3d2f1g0e9d"
      ],
      "updatedAt": "2026-04-26T15:30:00Z"
    },
    {
      "hash": "0c5b9e6a4f9e4e1f8b6a3d2c1e0f9d8c",
      "slug": null,
      "title": "Part 1. 파이썬 기초 / 01. 실습 환경 준비",
      "cover": null,
      "render": "doc",
      "type": "chapter",
      "parent": "550e8400e29b41d4a716446655440000",
      "order": 101,
      "chapters": null,
      "updatedAt": "2026-04-26T15:30:00Z"
    }
  ]
}
```

## 7.3 페이지별 콘텐츠 (`/content/<hash>/index.md`)

**핵심 결정**: 페이지의 frontmatter + 본문을 단일 마크다운 파일로 보관. 별도 meta.json X.

이유: public 레포 clone 후 마크다운 파일 그대로 읽을 수 있음 + 한 페이지 = 한 fetch + 옵시디언 사용자에게 친숙한 형식.

```markdown
---
hash: 550e8400e29b41d4a716446655440000
slug: code-ai-programming
title: 코드로 배우는 AI 프로그래밍
render: book
type: entry
parent: null
order: null
publishedAt: 2026-04-20T10:00:00Z
updatedAt: 2026-04-26T15:30:00Z
cover: /content/550e8400e29b41d4a716446655440000/_assets/book-cover.png
customCss: |
  .page { font-family: 'Noto Serif KR'; }
  .heading { letter-spacing: -0.02em; }
---
# 작가의 말

...본문 시작...
```

### PageFrontmatter 타입

```ts
type PageFrontmatter = {
  hash:        string
  slug:        string | null
  title:       string
  render:      'book' | 'doc'
  type:        'entry' | 'chapter'
  parent:      string | null
  order:       number | null
  cover:       string | null
  customCss:   string | null         // 인라인 + 파일 합쳐서 (안전 sanitize 후)
  publishedAt: string                // 첫 발행 시각, 이후 immutable
  updatedAt:   string
}
```

manifest 와의 차이:
- per-page 에 `customCss` 추가 (manifest 엔 없음)
- per-page 에 `publishedAt` 추가 (manifest 엔 안 씀)
- per-page 엔 `chapters` 없음 (entry 라면 manifest 에서 조회)

## 7.4 폴더 구조 (public 레포)

```
notedrop/                                    ← public 레포 루트 (siakun/notedrop)
├── manifest.json                            ← 카탈로그
├── content/
│   ├── 550e8400e29b41d4a716446655440000/   ← 책 entry
│   │   ├── index.md
│   │   └── _assets/
│   │       └── book-cover.png
│   ├── 0c5b9e6a4f9e4e1f8b6a3d2c1e0f9d8c/   ← 챕터 1
│   │   ├── index.md
│   │   └── _assets/
│   │       └── p1-jupyter.png
│   ├── 1d6caf7b5a0f5f2g9c7b4e3d2f1g0e9d/   ← 챕터 2
│   │   ├── index.md
│   │   └── _assets/
│   └── ...
├── viewer/                                  ← Next.js 빌드 결과
│   ├── index.html
│   ├── _next/...
│   └── ...
├── README.md                                ← 레포 자체 설명 (사람용)
└── .github/workflows/deploy.yml             ← 정적 파일 deploy
```

GH Pages 가 viewer/ 의 정적 파일을 서빙 + content/, manifest.json 도 같은 도메인에서 서빙. 같은 origin 이라 fetch CORS 문제 없음.

## 7.5 자산 처리 규약

- 이미지 ref 발견 시 vault 에서 위치 찾기 (같은 폴더 → 부모 → vault 전체 search by 파일명)
- 발견된 이미지를 `content/<hash>/_assets/<filename>` 으로 복사
- 마크다운 안 이미지 경로를 절대 경로로 재작성: `<img src="/content/<hash>/_assets/<filename>" width="...">`
- 같은 vault 이미지가 여러 챕터에서 쓰이면 챕터마다 복사 (저장 redundancy 약간 있지만 collision 없음)
- 지원 포맷: png / jpg / jpeg / svg / webp / gif (MVP)
- 미지원 포맷 또는 ref 깨짐: placeholder + warnings 에 기록, 발행 자체는 계속

상세: [decisions/0017-자산-챕터별-분리.md](decisions/0017-자산-챕터별-분리.md)

## 7.6 frontmatter 키 명세 (vault 측)

플러그인이 vault 노트의 frontmatter 에서 **읽는** 키:

| 키 | 타입 | 의미 |
|---|---|---|
| `notedrop-publish` | `boolean` | true 면 발행 대상 |
| `notedrop-render` | `'book' \| 'doc'` | 생략 시 폴더 패턴으로 자동 추정 |
| `notedrop-slug` | `string` | URL slug override |
| `notedrop-cover` | `string` | 책 표지 이미지 vault 경로 |
| `notedrop-css` | `string` | 인라인 CSS (YAML 멀티라인) |
| `notedrop-css-file` | `string` | vault 내 CSS 파일 경로 |

플러그인이 **쓰는** 키:

| 키 | 언제 |
|---|---|
| `notedrop-publish` | "Share" / "Unshare" 명령어 시 토글만 |

→ 다른 키 (사용자의 mood, summary, source, custom 등) 는 절대 안 건드림.

→ title, summary, tags 는 읽지도 않고 쓰지도 않음. title 은 파일명에서 derive, summary·tags 는 미사용.

## 7.7 버전 관리

| 버전 | 변화 빈도 | 형식 | 예시 |
|---|---|---|---|
| 플러그인 버전 | 자주 (기능·픽스마다) | semver | `0.1.0` → `0.1.1` → `0.2.0` → ... → `1.0.0` |
| Manifest 스키마 버전 | 드물게 (호환 깨질 때만) | 정수 | `1` → `2` |

호환 룰:
- **호환 변경** (필드 추가만): version 유지. 구버전 뷰어는 새 필드 무시
- **비호환 변경** (필드 제거·의미 변경): version bump. 구버전 뷰어 경고

마이그레이션: 플러그인이 구버전 manifest 발견 시 다음 publish 때 새 버전으로 덮어쓰기.

뷰어는 fetch 한 manifest 의 `version` 검사:
- 같음: 정상 처리
- 더 낮음: 정상 처리 (구버전 뷰어가 신버전 데이터 받는 경우 - 무시 가능 필드만이라야)
- 더 높음: 경고 표시 + 가능한 만큼 처리

## 7.8 엣지 케이스 명세

| 케이스 | 처리 |
|---|---|
| 책 entry 발행 전에 챕터 발행 시도 | 챕터를 단독 doc 으로 폴백 (`type: 'entry'`). parent 매니페스트에 없으면 자동 |
| 책 entry 발행됐는데 일부 챕터만 발행 | 발행된 것만 manifest 의 chapters 배열에 포함. 사이드바 TOC 도 그것만 |
| 챕터 발행 해제 | manifest 에서 제거 + 책 entry 의 chapters 배열에서 제거 + 책 entry republish |
| 책 entry slug 변경 | URL 바뀜. hash 그대로라 챕터 parent reference 안 깨짐 |
| 같은 vault 파일 재발행 | hash 동일, updatedAt 만 갱신 |
| 발행됐던 파일 vault 에서 삭제 | `vault.on('delete')` 자동 unpublish |
| `notedrop-slug` 충돌 | 두 번째는 `<slug>-2` 자동 부여 + 사용자 경고 |
