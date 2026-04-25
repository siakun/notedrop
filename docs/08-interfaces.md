---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - arc42
  - interfaces
summary: Ports·Domain·Infrastructure 핵심 contract (TypeScript). 인터페이스 안정성 등급
---
# 08. Interfaces

각 모듈 간 통신 계약. 이게 안정되면 모듈을 독립 개발·테스트 가능. Hexagonal 의 *Ports* 가 여기.

플러그인 내부 데이터 형태 (PublishedItem, Reference 등) 와 public 출력 형태 (ManifestItem, PageFrontmatter) 는 다른 점에 주의. public 출력은 [07-data-model.md](07-data-model.md) 참조.

## 8.1 Ports - Domain 이 외부에 요구하는 추상

옵시디언·Node API 의존성을 격리하는 인터페이스. 테스트에선 InMemory 구현체로 교체.

```ts
interface VaultFs {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  fileExists(path: string): Promise<boolean>
  listFiles(folderPath: string): Promise<string[]>
  searchByName(filename: string): Promise<string[]>     // vault 전체 search
}

interface MetaCache {
  getFrontmatter(path: string): Record<string, unknown> | null
  getHeadings(path: string): { heading: string, level: number }[]
  getLinks(path: string): { link: string, displayText?: string }[]
  on(event: 'changed' | 'deleted' | 'renamed',
     handler: (path: string, oldPath?: string) => void): () => void
}

interface GitClient {
  clone(repoUrl: string, dest: string, auth: GitAuth): Promise<void>
  add(dest: string, paths: string[]): Promise<void>
  commit(dest: string, message: string, author: GitAuthor): Promise<void>
  push(dest: string, auth: GitAuth): Promise<void>
}

type GitAuth   = { username: string, token: string }
type GitAuthor = { name: string, email: string }
```

## 8.2 Domain Layer

### 8.2.1 PublishIndex

```ts
class PublishIndex {
  constructor(private vault: VaultFs, private meta: MetaCache) {}
  
  // 시작 시 풀스캔 1회. 이후 이벤트 기반 incremental update
  async build(): Promise<void>
  
  // 조회
  get(hash: string): PublishedItem | null
  getByPath(filePath: string): PublishedItem | null
  getBySlug(slug: string): PublishedItem | null
  list(): PublishedItem[]
  listChildren(parentHash: string): PublishedItem[]
  
  // 갱신 (VaultEventBridge 가 호출)
  upsert(filePath: string): PublishedItem | null   // null = publish flag 없음
  remove(filePath: string): void
  rename(oldPath: string, newPath: string): void
  
  // 변경 이벤트 (LocalServer SSE 브로드캐스트용)
  on(event: 'changed' | 'added' | 'removed',
     handler: (hash: string) => void): () => void
}

// 인메모리 표현. public 출력 (ManifestItem, PageFrontmatter) 과 거의 같지만
// 디버그용 filePath 추가. customCss 는 변환 시점에 결정 (file 참조 처리)
type PublishedItem = {
  hash:        string
  slug:        string | null
  filePath:    string                // vault 경로 (인덱싱·디버그용, 외부 노출 X)
  title:       string                // 파일명에서 derive
  render:      'book' | 'doc'
  type:        'entry' | 'chapter'
  parent:      string | null
  order:       number | null
  chapters:    string[] | null
  cover:       string | null
  customCssRaw: { inline: string | null, file: string | null }  // 변환 전
  publishedAt: string                // 첫 발행 시각
  updatedAt:   string
}
```

### 8.2.2 ContentResolver

```ts
class ContentResolver {
  constructor(
    private vault: VaultFs,
    private meta: MetaCache,
    private index: PublishIndex
  ) {}
  
  async resolve(filePath: string): Promise<ResolvedContent>
}

type ResolvedContent = {
  rawMarkdown: string                  // vault 그대로 (frontmatter 포함)
  frontmatter: Record<string, unknown> // 파싱된 frontmatter
  refs:        Reference[]             // 모든 [[]], ![[]], 이미지 ref
}

type Reference = {
  type:    'wikilink' | 'embed' | 'image'
  rawText: string                      // 예: "![[p2-foo.svg|700]]"
  target:  string                      // 노트명 또는 이미지 파일명
  alias?:  string
  anchor?: string                      // [[Note#Heading]]
  blockId?: string                     // [[Note#^block]]
  size?:   { width?: number, height?: number }
  
  resolution:
    | { kind: 'published-note',   hash: string, slug: string | null }
    | { kind: 'unpublished-note', noteName: string }
    | { kind: 'image',            vaultPath: string, mime: string }
    | { kind: 'broken',           reason: string }
}
```

### 8.2.3 ContentTransformer

```ts
class ContentTransformer {
  constructor(private resolver: ContentResolver) {}
  
  async transform(filePath: string): Promise<TransformedContent>
}

type TransformedContent = {
  // public 출력용 frontmatter (vault 원본의 noise 제거, notedrop-* 와 derive 값만)
  outputFrontmatter: PageFrontmatter
  
  // 청정 마크다운: HIDE 적용 (%%, Waypoint), 안전장치 적용 (미발행 ref → dead link)
  // 이미지 경로는 절대 경로 (/content/<hash>/_assets/...) 로 재작성
  markdown: string
  
  // 발행 시 복사할 자산 목록
  assetRefs: AssetRef[]
  
  // 디버그·경고 (예: "dataview block left as PASSTHROUGH")
  warnings: string[]
}

// PageFrontmatter 정의는 07-data-model.md 7.3 참조
type AssetRef = {
  vaultPath:  string                    // vault 내 원본 경로
  outputPath: string                    // /content/<hash>/_assets/<filename>
  size:       number                    // bytes
  mime:       string
}
```

### 8.2.4 AssetCollector

```ts
class AssetCollector {
  constructor(private vault: VaultFs) {}
  
  // refs 에서 vault 내 위치 찾기 + AssetRef 리스트 반환 (라이브 모드)
  async findRefs(refs: Reference[], hash: string): Promise<AssetRef[]>
  
  // 실제 파일 복사 (발행 모드만)
  async copy(refs: AssetRef[], destFolder: string): Promise<void>
}
```

### 8.2.5 BookAssembler

```ts
class BookAssembler {
  constructor(
    private vault: VaultFs,
    private meta: MetaCache,
    private index: PublishIndex
  ) {}
  
  async assemble(entryFilePath: string): Promise<ChapterPlan>
}

type ChapterPlan = {
  source: 'waypoint' | 'moc' | 'folder-scan'   // 어느 폴백 단계에서 결정됐는지
  chapters: { filePath: string, order: number }[]
}
```

### 8.2.6 ManifestBuilder

```ts
class ManifestBuilder {
  constructor(private index: PublishIndex) {}
  
  build(opts: { generatedBy: string }): Manifest
}

// Manifest, ManifestItem 정의는 07-data-model.md 7.2 참조
```

## 8.3 Infrastructure Layer

### 8.3.1 LocalServer

```ts
class LocalServer {
  constructor(
    private port: number,
    private viewerDistPath: string,   // 플러그인 번들된 뷰어 정적 파일 디렉터리
    private deps: {
      index: PublishIndex
      transformer: ContentTransformer
      collector: AssetCollector
      assembler: BookAssembler
      manifestBuilder: ManifestBuilder
    }
  ) {}
  
  async start(): Promise<{ url: string, port: number }>
  async stop(): Promise<void>
  
  // VaultEventBridge 가 호출 → SSE 브로드캐스트
  notifyChange(hash: string, type: 'content' | 'manifest'): void
  notifyRemoved(hash: string): void
}
```

라우팅:

| 경로 | 응답 |
|---|---|
| `GET /` | viewerDistPath/index.html |
| `GET /_next/...`, `/static/...` | viewer 정적 자산 |
| `GET /manifest.json` | ManifestBuilder.build() 결과 |
| `GET /content/<hash>/index.md` | ContentTransformer.transform() + frontmatter+body 합쳐서 응답 |
| `GET /content/<hash>/_assets/<file>` | vault 에서 파일 직접 스트림 |
| `GET /__events` | SSE 스트림 |

### 8.3.2 GitPublisher

```ts
class GitPublisher {
  constructor(
    private git: GitClient,
    private config: { repoUrl: string, auth: GitAuth, workDir: string },
    private deps: {
      index: PublishIndex
      transformer: ContentTransformer
      assembler: BookAssembler
      collector: AssetCollector
      manifestBuilder: ManifestBuilder
    }
  ) {}
  
  async publish(filePath: string): Promise<{ url: string }>
  async unpublish(filePath: string): Promise<void>
  
  // 동시 호출 직렬화용
  private mutex: Mutex
}
```

### 8.3.3 VaultEventBridge

```ts
class VaultEventBridge {
  constructor(
    private app: App,                 // Obsidian
    private index: PublishIndex,
    private localServer: LocalServer | null    // null = 미리보기 안 돌고 있음
  ) {}
  
  start(): void                       // 이벤트 구독 시작
  stop(): void                        // 구독 해제
  
  setLocalServer(server: LocalServer | null): void   // 서버 시작·중지 시 갱신
}
```

## 8.4 Frontmatter 키 명세 (재명시)

플러그인이 vault 노트의 frontmatter 에서 **읽는** 키:

| 키 | 타입 |
|---|---|
| `notedrop-publish` | `boolean` |
| `notedrop-render` | `'book' \| 'doc'` |
| `notedrop-slug` | `string` |
| `notedrop-cover` | `string` |
| `notedrop-css` | `string` |
| `notedrop-css-file` | `string` |

플러그인이 **쓰는** 키:

| 키 | 언제 |
|---|---|
| `notedrop-publish` | "Share" / "Unshare" 명령어 시 토글 |

→ title, summary, tags 모두 안 읽고 안 씀. 다른 키도 절대 안 건드림.

## 8.5 인터페이스 안정성 등급

| 인터페이스 | 변경 영향 | 안정성 |
|---|---|---|
| Manifest, PageFrontmatter (public 출력) | manifest 스키마 버전 bump 필요 | **Stable** - 신중히 |
| VaultFs, MetaCache, GitClient (Ports) | 모든 Adapter + 모든 fake 영향 | **Stable** - 신중히 |
| PublishedItem (인메모리) | 플러그인 내부 - 자유롭게 | Internal |
| Reference, ResolvedContent, TransformedContent | Domain 내부 - 자유롭게 | Internal |
| frontmatter 키 (`notedrop-*`) | 사용자 vault 영향 (마이그레이션 필요) | **Stable** - 신중히 |

## 8.6 테스트 시나리오 (인터페이스가 가능케 하는 것)

```ts
// Port 를 fake 로 교체 → Domain 단독 테스트
class InMemoryVaultFs implements VaultFs { /* Map<string, string> */ }
class FakeMetaCache implements MetaCache { /* 시나리오별 frontmatter 주입 */ }
class FakeGitClient implements GitClient { /* 호출 기록만 */ }

test('미발행 노트 위키링크는 빨간 dead link 로 변환된다', async () => {
  const vault = new InMemoryVaultFs({
    '/published.md': '---\nnotedrop-publish: true\n---\n본문 [[비공개]] 끝.',
    '/비공개.md':    '---\n---\n비공개 본문',
  })
  const meta = new FakeMetaCache(/* ... */)
  const index = new PublishIndex(vault, meta)
  await index.build()
  const transformer = new ContentTransformer(new ContentResolver(vault, meta, index))
  
  const result = await transformer.transform('/published.md')
  
  expect(result.markdown).toContain('비공개(접근 권한이 없습니다)')
  expect(result.markdown).not.toMatch(/\[\[비공개\]\]/)
})
```

옵시디언 안 켜져도 모든 변환 로직 검증 가능 → CI 친화.
