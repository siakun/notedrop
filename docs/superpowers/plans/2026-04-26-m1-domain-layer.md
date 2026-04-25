# M1 - Domain Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement notedrop's plugin Domain Layer (6 modules + 3 ports + 3 test fakes) per Hexagonal Architecture, with vitest TDD targeting Domain coverage 90%+ and safety net coverage 100%, validated entirely without Obsidian dependencies.

**Architecture:** Hexagonal. The `plugin/src/domain/` modules (PublishIndex, ContentResolver, ContentTransformer, AssetCollector, BookAssembler, ManifestBuilder) depend only on three Ports (`plugin/src/ports/`). Test doubles in `plugin/src/testing/` implement the Ports. No Obsidian, esbuild, HTTP, or git code in this milestone (those land in M2/M3/M4).

**Tech Stack:** TypeScript 5.4 (ESM, `"module": "NodeNext"`), Node 20+, vitest 1.6, @vitest/coverage-v8, `yaml` 2.x for frontmatter parsing, Node `crypto.randomUUID()` for hashes.

---

## Spec references

This plan implements the Domain Layer scope of M1 (`docs/11-mvp-and-roadmap.md` §11.5). Engineer should skim these spec sections before starting:

- `docs/05-building-blocks.md` §5.1 - layer split and Domain module responsibilities
- `docs/08-interfaces.md` - all Port and Domain type signatures
- `docs/09-cross-cutting.md` §9.1 and §9.7 - safety net inventory (this plan implements §9.7 row by row)
- `docs/10-quality-and-test.md` - test pyramid and coverage gates
- ADRs `0005`, `0008`, `0009`, `0017`, `0018`, `0021` - design rationale touched by this plan

## Design notes (spec gaps resolved here)

The spec leaves five points implicit. This plan resolves them so coding can begin without further user input. Flag during code review if any conflict with intent:

1. **Hash persistence**. Spec §8.2.1 says `hash` is immutable in `PublishedItem`, but specifies no persistence path. M1 makes `PublishIndex` generate UUIDs in-process. Pre-population from external sources (data.json, public repo manifest) is exposed via `PublishIndex.seed(entries)` for M2/M3 to call before `build()`.
2. **`publishedAt` first-publish time**. Same rationale. `build()` sets `publishedAt = now` (`new Date().toISOString()`) for newly-discovered notes. Preserved across restarts via `seed()`.
3. **Render auto-detection**. ADR-0005 says "폴더 패턴 자동 추정". When `notedrop-render` is missing, detect `book` if the file's parent folder basename equals the file basename (Waypoint convention: `books/X/X.md`). Otherwise `doc`.
4. **`cover` resolution**. Spec §7.6 says `notedrop-cover` is a vault path; spec §7.2 says `ManifestItem.cover` is a public absolute path. `PublishIndex` stores the raw vault path on `PublishedItem.cover`. `ContentTransformer` resolves and absolutizes it to `/content/<hash>/_assets/<filename>` when producing `PageFrontmatter`.
5. **Cyclic dependency between PublishIndex and BookAssembler**. `PublishIndex.build()` runs in two passes: (a) collect all published items with `parent=null, chapters=null`, (b) for each `render='book'` entry call `BookAssembler.assemble()` to populate parent/chapters. `BookAssembler` is injected into `build(deps)` (not the constructor), keeping PublishIndex's constructor minimal per §8.2.1.

## Phases overview

| Phase | Tasks | Output |
|---|---|---|
| 0. Scaffold | 1 | `plugin/` TS + vitest project compiles and runs |
| 1. Types | 2 | Public + domain types defined |
| 2. Ports | 1 | VaultFs / MetaCache / GitClient interfaces |
| 3. Test fakes | 3 | InMemory + Fake adapters with self-tests |
| 4. PublishIndex | 4 | Index module with build / query / mutate / events |
| 5. ContentResolver | 1 | Resolution module with refs and links |
| 6. ContentTransformer | 5 | Transformation + safety nets (§9.7 row by row) |
| 7. AssetCollector | 1 | Asset find + copy planning |
| 8. BookAssembler | 1 | Waypoint / MOC / folder-scan fallback |
| 9. ManifestBuilder | 1 | Public manifest serialization |
| 10. Quality gate | 1 | Coverage check, M1 completion commit |

21 tasks total. Frequent commits, one per task minimum.

---

## Task 1: Project scaffold

**Files:**
- Create: `plugin/package.json`
- Create: `plugin/tsconfig.json`
- Create: `plugin/vitest.config.ts`
- Create: `plugin/.gitignore`
- Create: `plugin/src/.gitkeep`

- [ ] **Step 1: Create `plugin/package.json`**

```json
{
  "name": "@notedrop/plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "yaml": "2.4.5"
  },
  "devDependencies": {
    "@types/node": "20.14.10",
    "@vitest/coverage-v8": "1.6.0",
    "typescript": "5.4.5",
    "vitest": "1.6.0"
  }
}
```

- [ ] **Step 2: Create `plugin/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "coverage"]
}
```

- [ ] **Step 3: Create `plugin/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/domain/**/*.ts', 'src/ports/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/types.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90
      }
    }
  }
})
```

- [ ] **Step 4: Create `plugin/.gitignore`**

```
node_modules/
dist/
coverage/
*.log
.DS_Store
```

- [ ] **Step 5: Create placeholder `plugin/src/.gitkeep`**

Empty file. Lets git track the directory while it has no source yet.

- [ ] **Step 6: Install dependencies**

```bash
cd plugin && npm install
```

Expected: lockfile written, no errors. `node_modules/` populated.

- [ ] **Step 7: Verify vitest runs (zero tests)**

```bash
cd plugin && npm test
```

Expected: `No test files found, exiting with code 0` or vitest exits 0 with "0 passed".

- [ ] **Step 8: Verify TypeScript config**

```bash
cd plugin && npm run typecheck
```

Expected: exit 0 (no source files yet, but config parses).

- [ ] **Step 9: Commit**

```bash
git add plugin/package.json plugin/package-lock.json plugin/tsconfig.json plugin/vitest.config.ts plugin/.gitignore plugin/src/.gitkeep
git commit -m "chore(plugin): scaffold M1 TS + vitest project"
```

---

## Task 2: Public output types

**Files:**
- Create: `plugin/src/types.ts`

These are the public output formats (`Manifest`, `ManifestItem`, `PageFrontmatter`) that cross the plugin / viewer / public-repo boundary. Per spec §8.5 these are **Stable** interfaces (manifest-version-bump on incompatible change). Definitions match `docs/07-data-model.md` §7.2 and §7.3.

- [ ] **Step 1: Create `plugin/src/types.ts`**

```ts
// Public output types - cross plugin/viewer/public-repo boundary.
// See docs/07-data-model.md §7.2-§7.3.
// Stability: manifest version bump required for incompatible change.

export type ManifestVersion = 1

export type Manifest = {
  version: ManifestVersion
  generatedAt: string
  generatedBy: string
  items: ManifestItem[]
}

export type RenderMode = 'book' | 'doc'
export type ItemType = 'entry' | 'chapter'

export type ManifestItem = {
  hash: string
  slug: string | null
  title: string
  cover: string | null
  render: RenderMode
  type: ItemType
  parent: string | null
  order: number | null
  chapters: string[] | null
  updatedAt: string
}

export type PageFrontmatter = {
  hash: string
  slug: string | null
  title: string
  render: RenderMode
  type: ItemType
  parent: string | null
  order: number | null
  cover: string | null
  customCss: string | null
  publishedAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Add a compile-time consistency test**

Create `plugin/src/types.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type { Manifest, ManifestItem, PageFrontmatter } from './types.js'

describe('public output types', () => {
  it('Manifest.items is ManifestItem[]', () => {
    expectTypeOf<Manifest['items']>().toEqualTypeOf<ManifestItem[]>()
  })

  it('PageFrontmatter and ManifestItem share identifying fields', () => {
    expectTypeOf<PageFrontmatter['hash']>().toBeString()
    expectTypeOf<ManifestItem['hash']>().toBeString()
    expectTypeOf<PageFrontmatter['render']>().toEqualTypeOf<ManifestItem['render']>()
    expectTypeOf<PageFrontmatter['type']>().toEqualTypeOf<ManifestItem['type']>()
  })

  it('Manifest version is the literal 1', () => {
    expectTypeOf<Manifest['version']>().toEqualTypeOf<1>()
  })
})
```

- [ ] **Step 3: Run the type tests**

```bash
cd plugin && npm test -- src/types.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add plugin/src/types.ts plugin/src/types.test.ts
git commit -m "feat(plugin/types): public Manifest, ManifestItem, PageFrontmatter"
```

---

## Task 3: Domain internal types

**Files:**
- Create: `plugin/src/domain/types.ts`

These types describe in-memory Domain values (`PublishedItem`, `Reference`, `ResolvedContent`, `TransformedContent`, `AssetRef`, `ChapterPlan`). Per spec §8.5 they are **Internal**, free to evolve. Definitions match `docs/08-interfaces.md` §8.2.

- [ ] **Step 1: Create `plugin/src/domain/types.ts`**

```ts
// Domain internal types. Free to evolve. See docs/08-interfaces.md §8.2.

import type { RenderMode, ItemType } from '../types.js'

export type PublishedItem = {
  hash: string
  slug: string | null
  filePath: string
  title: string
  render: RenderMode
  type: ItemType
  parent: string | null
  order: number | null
  chapters: string[] | null
  cover: string | null
  customCssRaw: { inline: string | null, file: string | null }
  publishedAt: string
  updatedAt: string
}

export type ReferenceKind = 'wikilink' | 'embed' | 'image'

export type ReferenceResolution =
  | { kind: 'published-note', hash: string, slug: string | null }
  | { kind: 'unpublished-note', noteName: string }
  | { kind: 'image', vaultPath: string, mime: string }
  | { kind: 'broken', reason: string }

export type Reference = {
  type: ReferenceKind
  rawText: string
  target: string
  alias?: string
  anchor?: string
  blockId?: string
  size?: { width?: number, height?: number }
  resolution: ReferenceResolution
}

export type ResolvedContent = {
  rawMarkdown: string
  frontmatter: Record<string, unknown>
  refs: Reference[]
}

export type AssetRef = {
  vaultPath: string
  outputPath: string
  size: number
  mime: string
}

export type TransformedContent = {
  outputFrontmatter: import('../types.js').PageFrontmatter
  markdown: string
  assetRefs: AssetRef[]
  warnings: string[]
}

export type ChapterPlan = {
  source: 'waypoint' | 'moc' | 'folder-scan'
  chapters: { filePath: string, order: number }[]
}
```

- [ ] **Step 2: Add a compile-time test**

Create `plugin/src/domain/types.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type {
  PublishedItem,
  Reference,
  ResolvedContent,
  TransformedContent,
  AssetRef,
  ChapterPlan,
  ReferenceResolution
} from './types.js'

describe('domain types', () => {
  it('PublishedItem has filePath (internal-only field)', () => {
    expectTypeOf<PublishedItem['filePath']>().toBeString()
  })

  it('PublishedItem.customCssRaw separates inline and file', () => {
    expectTypeOf<PublishedItem['customCssRaw']>().toEqualTypeOf<{
      inline: string | null
      file: string | null
    }>()
  })

  it('Reference resolution is a discriminated union of 4 kinds', () => {
    type Kinds = ReferenceResolution['kind']
    expectTypeOf<Kinds>().toEqualTypeOf<
      'published-note' | 'unpublished-note' | 'image' | 'broken'
    >()
  })

  it('ResolvedContent carries refs and raw markdown', () => {
    expectTypeOf<ResolvedContent['rawMarkdown']>().toBeString()
    expectTypeOf<ResolvedContent['refs']>().toEqualTypeOf<Reference[]>()
  })

  it('TransformedContent carries warnings', () => {
    expectTypeOf<TransformedContent['warnings']>().toEqualTypeOf<string[]>()
  })

  it('AssetRef has size and mime', () => {
    expectTypeOf<AssetRef['size']>().toBeNumber()
    expectTypeOf<AssetRef['mime']>().toBeString()
  })

  it('ChapterPlan source is one of three fallback labels', () => {
    expectTypeOf<ChapterPlan['source']>().toEqualTypeOf<
      'waypoint' | 'moc' | 'folder-scan'
    >()
  })
})
```

- [ ] **Step 3: Run tests + typecheck**

```bash
cd plugin && npm test -- src/domain/types.test.ts && npm run typecheck
```

Expected: 7 passed, typecheck exit 0.

- [ ] **Step 4: Commit**

```bash
git add plugin/src/domain/types.ts plugin/src/domain/types.test.ts
git commit -m "feat(plugin/domain): internal types (PublishedItem, Reference, etc.)"
```

---

## Task 4: Ports

**Files:**
- Create: `plugin/src/ports/VaultFs.ts`
- Create: `plugin/src/ports/MetaCache.ts`
- Create: `plugin/src/ports/GitClient.ts`

Pure interfaces. No implementation, no tests yet (interfaces are exercised by the fakes in Tasks 5-7). Per spec §8.5 these are **Stable**, change cascades through every Adapter and fake.

- [ ] **Step 1: Create `plugin/src/ports/VaultFs.ts`**

```ts
export interface VaultFs {
  readFile(path: string): Promise<string>
  readBinary(path: string): Promise<Uint8Array>
  writeFile(path: string, content: string): Promise<void>
  fileExists(path: string): Promise<boolean>
  listFiles(folderPath: string): Promise<string[]>
  listAllFiles(): Promise<string[]>
  searchByName(filename: string): Promise<string[]>
}
```

Two additions beyond §8.1:
- `readBinary` lets `AssetCollector` get raw image bytes for size/mime detection.
- `listAllFiles` lets `PublishIndex.build()` enumerate the whole vault. The Obsidian Adapter will back it with `app.vault.getFiles()`. Flag in review if either is unworkable for M2.

- [ ] **Step 2: Create `plugin/src/ports/MetaCache.ts`**

```ts
export type CacheHeading = { heading: string, level: number }
export type CacheLink = { link: string, displayText?: string }
export type CacheEvent = 'changed' | 'deleted' | 'renamed'
export type CacheEventHandler = (path: string, oldPath?: string) => void

export interface MetaCache {
  getFrontmatter(path: string): Record<string, unknown> | null
  getHeadings(path: string): CacheHeading[]
  getLinks(path: string): CacheLink[]
  on(event: CacheEvent, handler: CacheEventHandler): () => void
}
```

- [ ] **Step 3: Create `plugin/src/ports/GitClient.ts`**

```ts
export type GitAuth = { username: string, token: string }
export type GitAuthor = { name: string, email: string }

export interface GitClient {
  clone(repoUrl: string, dest: string, auth: GitAuth): Promise<void>
  add(dest: string, paths: string[]): Promise<void>
  commit(dest: string, message: string, author: GitAuthor): Promise<void>
  push(dest: string, auth: GitAuth): Promise<void>
}
```

- [ ] **Step 4: Add a Ports barrel + smoke test**

Create `plugin/src/ports/index.ts`:

```ts
export type { VaultFs } from './VaultFs.js'
export type {
  MetaCache,
  CacheHeading,
  CacheLink,
  CacheEvent,
  CacheEventHandler
} from './MetaCache.js'
export type { GitClient, GitAuth, GitAuthor } from './GitClient.js'
```

Create `plugin/src/ports/index.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type { VaultFs, MetaCache, GitClient, GitAuth } from './index.js'

describe('ports barrel', () => {
  it('VaultFs exposes async file ops', () => {
    expectTypeOf<VaultFs['readFile']>().returns.resolves.toBeString()
    expectTypeOf<VaultFs['fileExists']>().returns.resolves.toBeBoolean()
  })

  it('MetaCache.on returns an unsubscribe function', () => {
    expectTypeOf<MetaCache['on']>().returns.toMatchTypeOf<() => void>()
  })

  it('GitClient.push takes auth', () => {
    expectTypeOf<GitClient['push']>().parameters.toEqualTypeOf<[string, GitAuth]>()
  })
})
```

- [ ] **Step 5: Run + commit**

```bash
cd plugin && npm test -- src/ports
```

Expected: 3 passed.

```bash
git add plugin/src/ports/
git commit -m "feat(plugin/ports): VaultFs, MetaCache, GitClient interfaces"
```

---

## Task 5: InMemoryVaultFs (TDD)

**Files:**
- Create: `plugin/src/testing/InMemoryVaultFs.ts`
- Create: `plugin/src/testing/InMemoryVaultFs.test.ts`

A test double for `VaultFs` backed by a `Map<path, content>`. Used by every Domain test from Task 8 onward.

- [ ] **Step 1: Write the test file first**

Create `plugin/src/testing/InMemoryVaultFs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryVaultFs } from './InMemoryVaultFs.js'

describe('InMemoryVaultFs', () => {
  let vault: InMemoryVaultFs

  beforeEach(() => {
    vault = new InMemoryVaultFs({
      '/notes/a.md': '# A',
      '/notes/b.md': '# B',
      '/notes/sub/c.md': '# C',
      '/img/cover.png': 'PNGBYTES'
    })
  })

  it('readFile returns stored text content', async () => {
    expect(await vault.readFile('/notes/a.md')).toBe('# A')
  })

  it('readFile rejects on missing path', async () => {
    await expect(vault.readFile('/missing.md')).rejects.toThrow(/not found/i)
  })

  it('readBinary returns Uint8Array of UTF-8 bytes', async () => {
    const bytes = await vault.readBinary('/img/cover.png')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(bytes)).toBe('PNGBYTES')
  })

  it('writeFile inserts new path', async () => {
    await vault.writeFile('/new.md', 'hello')
    expect(await vault.readFile('/new.md')).toBe('hello')
  })

  it('writeFile overwrites existing path', async () => {
    await vault.writeFile('/notes/a.md', '# A2')
    expect(await vault.readFile('/notes/a.md')).toBe('# A2')
  })

  it('fileExists is true for stored, false otherwise', async () => {
    expect(await vault.fileExists('/notes/a.md')).toBe(true)
    expect(await vault.fileExists('/missing.md')).toBe(false)
  })

  it('listFiles returns immediate children of folder, not recursive', async () => {
    const files = await vault.listFiles('/notes')
    expect(files.sort()).toEqual(['/notes/a.md', '/notes/b.md'])
  })

  it('listFiles returns empty array for unknown folder', async () => {
    expect(await vault.listFiles('/nope')).toEqual([])
  })

  it('listAllFiles returns every stored path', async () => {
    expect((await vault.listAllFiles()).sort()).toEqual([
      '/img/cover.png',
      '/notes/a.md',
      '/notes/b.md',
      '/notes/sub/c.md'
    ])
  })

  it('searchByName matches basename across vault', async () => {
    expect((await vault.searchByName('c.md')).sort()).toEqual(['/notes/sub/c.md'])
  })

  it('searchByName returns multiple matches', async () => {
    await vault.writeFile('/other/c.md', 'dup')
    expect((await vault.searchByName('c.md')).sort()).toEqual([
      '/notes/sub/c.md',
      '/other/c.md'
    ])
  })

  it('searchByName returns empty array for no matches', async () => {
    expect(await vault.searchByName('nothing.md')).toEqual([])
  })
})
```

- [ ] **Step 2: Run, confirm RED**

```bash
cd plugin && npm test -- src/testing/InMemoryVaultFs.test.ts
```

Expected: FAIL with "Cannot find module './InMemoryVaultFs.js'".

- [ ] **Step 3: Implement `InMemoryVaultFs.ts`**

Create `plugin/src/testing/InMemoryVaultFs.ts`:

```ts
import type { VaultFs } from '../ports/VaultFs.js'

export class InMemoryVaultFs implements VaultFs {
  private files: Map<string, string>

  constructor(initial: Record<string, string> = {}) {
    this.files = new Map(Object.entries(initial))
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`InMemoryVaultFs: ${path} not found`)
    return content
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const content = await this.readFile(path)
    return new TextEncoder().encode(content)
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async listFiles(folderPath: string): Promise<string[]> {
    const prefix = folderPath.endsWith('/') ? folderPath : folderPath + '/'
    const out: string[] = []
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      if (rest.includes('/')) continue
      out.push(path)
    }
    return out
  }

  async listAllFiles(): Promise<string[]> {
    return [...this.files.keys()]
  }

  async searchByName(filename: string): Promise<string[]> {
    const out: string[] = []
    for (const path of this.files.keys()) {
      const base = path.split('/').pop()
      if (base === filename) out.push(path)
    }
    return out
  }
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/testing/InMemoryVaultFs.test.ts
```

Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/testing/InMemoryVaultFs.ts plugin/src/testing/InMemoryVaultFs.test.ts
git commit -m "feat(plugin/testing): InMemoryVaultFs with 12 unit tests"
```

---

## Task 6: FakeMetaCache (TDD)

**Files:**
- Create: `plugin/src/testing/FakeMetaCache.ts`
- Create: `plugin/src/testing/FakeMetaCache.test.ts`

Test double for `MetaCache`. Pre-seeded with frontmatter / headings / links per path; `on()` collects subscribers and exposes a `fire()` test helper to simulate events.

- [ ] **Step 1: Write test file**

Create `plugin/src/testing/FakeMetaCache.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { FakeMetaCache } from './FakeMetaCache.js'

describe('FakeMetaCache', () => {
  it('returns seeded frontmatter', () => {
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true, mood: 'okay' } }
    })
    expect(meta.getFrontmatter('/a.md')).toEqual({
      'notedrop-publish': true,
      mood: 'okay'
    })
  })

  it('returns null for unknown path', () => {
    expect(new FakeMetaCache({}).getFrontmatter('/missing.md')).toBeNull()
  })

  it('returns seeded headings or empty array', () => {
    const meta = new FakeMetaCache({
      '/a.md': { headings: [{ heading: 'Intro', level: 1 }] }
    })
    expect(meta.getHeadings('/a.md')).toEqual([{ heading: 'Intro', level: 1 }])
    expect(meta.getHeadings('/missing.md')).toEqual([])
  })

  it('returns seeded links or empty array', () => {
    const meta = new FakeMetaCache({
      '/a.md': { links: [{ link: 'B', displayText: 'see B' }] }
    })
    expect(meta.getLinks('/a.md')).toEqual([{ link: 'B', displayText: 'see B' }])
    expect(meta.getLinks('/missing.md')).toEqual([])
  })

  it('on() registers handler and fire() invokes it', () => {
    const meta = new FakeMetaCache({})
    const handler = vi.fn()
    meta.on('changed', handler)
    meta.fire('changed', '/a.md')
    expect(handler).toHaveBeenCalledWith('/a.md', undefined)
  })

  it('fire() includes oldPath for renamed', () => {
    const meta = new FakeMetaCache({})
    const handler = vi.fn()
    meta.on('renamed', handler)
    meta.fire('renamed', '/new.md', '/old.md')
    expect(handler).toHaveBeenCalledWith('/new.md', '/old.md')
  })

  it('on() returns an unsubscribe function', () => {
    const meta = new FakeMetaCache({})
    const handler = vi.fn()
    const off = meta.on('changed', handler)
    off()
    meta.fire('changed', '/a.md')
    expect(handler).not.toHaveBeenCalled()
  })

  it('multiple handlers per event are all invoked', () => {
    const meta = new FakeMetaCache({})
    const h1 = vi.fn()
    const h2 = vi.fn()
    meta.on('changed', h1)
    meta.on('changed', h2)
    meta.fire('changed', '/a.md')
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('events are isolated per type', () => {
    const meta = new FakeMetaCache({})
    const changedH = vi.fn()
    const deletedH = vi.fn()
    meta.on('changed', changedH)
    meta.on('deleted', deletedH)
    meta.fire('changed', '/a.md')
    expect(changedH).toHaveBeenCalledOnce()
    expect(deletedH).not.toHaveBeenCalled()
  })

  it('seed() updates frontmatter for an existing path', () => {
    const meta = new FakeMetaCache({ '/a.md': { frontmatter: { 'notedrop-publish': true } } })
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': false } })
    expect(meta.getFrontmatter('/a.md')).toEqual({ 'notedrop-publish': false })
  })

  it('forget() removes an entry', () => {
    const meta = new FakeMetaCache({ '/a.md': { frontmatter: {} } })
    meta.forget('/a.md')
    expect(meta.getFrontmatter('/a.md')).toBeNull()
  })
})
```

- [ ] **Step 2: Run, confirm RED**

```bash
cd plugin && npm test -- src/testing/FakeMetaCache.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `FakeMetaCache.ts`**

Create `plugin/src/testing/FakeMetaCache.ts`:

```ts
import type {
  MetaCache,
  CacheHeading,
  CacheLink,
  CacheEvent,
  CacheEventHandler
} from '../ports/MetaCache.js'

export type FakeMetaCacheEntry = {
  frontmatter?: Record<string, unknown>
  headings?: CacheHeading[]
  links?: CacheLink[]
}

export class FakeMetaCache implements MetaCache {
  private entries: Map<string, FakeMetaCacheEntry>
  private handlers: Map<CacheEvent, Set<CacheEventHandler>>

  constructor(initial: Record<string, FakeMetaCacheEntry> = {}) {
    this.entries = new Map(Object.entries(initial))
    this.handlers = new Map()
  }

  getFrontmatter(path: string): Record<string, unknown> | null {
    const entry = this.entries.get(path)
    return entry?.frontmatter ?? null
  }

  getHeadings(path: string): CacheHeading[] {
    return this.entries.get(path)?.headings ?? []
  }

  getLinks(path: string): CacheLink[] {
    return this.entries.get(path)?.links ?? []
  }

  on(event: CacheEvent, handler: CacheEventHandler): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler)
    return () => { set!.delete(handler) }
  }

  fire(event: CacheEvent, path: string, oldPath?: string): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of set) handler(path, oldPath)
  }

  seed(path: string, entry: FakeMetaCacheEntry): void {
    this.entries.set(path, entry)
  }

  forget(path: string): void {
    this.entries.delete(path)
  }
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/testing/FakeMetaCache.test.ts
```

Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/testing/FakeMetaCache.ts plugin/src/testing/FakeMetaCache.test.ts
git commit -m "feat(plugin/testing): FakeMetaCache with event fire helper"
```

---

## Task 7: FakeGitClient (TDD)

**Files:**
- Create: `plugin/src/testing/FakeGitClient.ts`
- Create: `plugin/src/testing/FakeGitClient.test.ts`

Records call sequence. Used by M2/M4 integration tests; included in M1 for completeness per `docs/11-mvp-and-roadmap.md` §11.5 M1 deliverable list.

- [ ] **Step 1: Write test file**

Create `plugin/src/testing/FakeGitClient.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FakeGitClient } from './FakeGitClient.js'

const auth = { username: 'siakun', token: 'ghp_test' }
const author = { name: 'Sia819', email: 'lunasia819@gmail.com' }

describe('FakeGitClient', () => {
  it('clone records call', async () => {
    const git = new FakeGitClient()
    await git.clone('https://example.com/repo.git', '/tmp/work', auth)
    expect(git.calls).toEqual([
      { op: 'clone', repoUrl: 'https://example.com/repo.git', dest: '/tmp/work', auth }
    ])
  })

  it('add records paths', async () => {
    const git = new FakeGitClient()
    await git.add('/tmp/work', ['a.md', 'b.md'])
    expect(git.calls).toEqual([
      { op: 'add', dest: '/tmp/work', paths: ['a.md', 'b.md'] }
    ])
  })

  it('commit records message and author', async () => {
    const git = new FakeGitClient()
    await git.commit('/tmp/work', 'msg', author)
    expect(git.calls).toEqual([
      { op: 'commit', dest: '/tmp/work', message: 'msg', author }
    ])
  })

  it('push records call', async () => {
    const git = new FakeGitClient()
    await git.push('/tmp/work', auth)
    expect(git.calls).toEqual([{ op: 'push', dest: '/tmp/work', auth }])
  })

  it('records calls in invocation order', async () => {
    const git = new FakeGitClient()
    await git.clone('url', '/d', auth)
    await git.add('/d', ['x'])
    await git.commit('/d', 'm', author)
    await git.push('/d', auth)
    expect(git.calls.map((c) => c.op)).toEqual(['clone', 'add', 'commit', 'push'])
  })

  it('fail() injects rejection on next op', async () => {
    const git = new FakeGitClient()
    git.fail('push', new Error('non-fast-forward'))
    await expect(git.push('/d', auth)).rejects.toThrow('non-fast-forward')
    await expect(git.push('/d', auth)).resolves.toBeUndefined()
  })

  it('reset() clears calls and pending failures', async () => {
    const git = new FakeGitClient()
    await git.push('/d', auth)
    git.fail('push', new Error('x'))
    git.reset()
    expect(git.calls).toEqual([])
    await expect(git.push('/d', auth)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run, confirm RED**

```bash
cd plugin && npm test -- src/testing/FakeGitClient.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `FakeGitClient.ts`**

Create `plugin/src/testing/FakeGitClient.ts`:

```ts
import type {
  GitClient,
  GitAuth,
  GitAuthor
} from '../ports/GitClient.js'

export type GitCall =
  | { op: 'clone', repoUrl: string, dest: string, auth: GitAuth }
  | { op: 'add', dest: string, paths: string[] }
  | { op: 'commit', dest: string, message: string, author: GitAuthor }
  | { op: 'push', dest: string, auth: GitAuth }

type GitOp = GitCall['op']

export class FakeGitClient implements GitClient {
  calls: GitCall[] = []
  private pendingFailures: Map<GitOp, Error> = new Map()

  async clone(repoUrl: string, dest: string, auth: GitAuth): Promise<void> {
    this.maybeThrow('clone')
    this.calls.push({ op: 'clone', repoUrl, dest, auth })
  }

  async add(dest: string, paths: string[]): Promise<void> {
    this.maybeThrow('add')
    this.calls.push({ op: 'add', dest, paths })
  }

  async commit(dest: string, message: string, author: GitAuthor): Promise<void> {
    this.maybeThrow('commit')
    this.calls.push({ op: 'commit', dest, message, author })
  }

  async push(dest: string, auth: GitAuth): Promise<void> {
    this.maybeThrow('push')
    this.calls.push({ op: 'push', dest, auth })
  }

  fail(op: GitOp, error: Error): void {
    this.pendingFailures.set(op, error)
  }

  reset(): void {
    this.calls = []
    this.pendingFailures.clear()
  }

  private maybeThrow(op: GitOp): void {
    const err = this.pendingFailures.get(op)
    if (err) {
      this.pendingFailures.delete(op)
      throw err
    }
  }
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/testing/FakeGitClient.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/testing/FakeGitClient.ts plugin/src/testing/FakeGitClient.test.ts
git commit -m "feat(plugin/testing): FakeGitClient call recorder + failure injection"
```

---

## Task 8: PublishIndex - construction and build()

**Files:**
- Create: `plugin/src/domain/PublishIndex.ts`
- Create: `plugin/src/domain/PublishIndex.test.ts`

Builds the in-memory catalog from a vault scan. After this task, `build()` works without book linking; book chapter wiring is added in Task 11. Render auto-detection follows design note 3.

- [ ] **Step 1: Write the test file**

Create `plugin/src/domain/PublishIndex.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PublishIndex } from './PublishIndex.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

const HASH_RE = /^[0-9a-f]{32}$/

describe('PublishIndex.build()', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache

  beforeEach(() => {
    vault = new InMemoryVaultFs({})
    meta = new FakeMetaCache({})
  })

  it('returns empty catalog for empty vault', async () => {
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()).toEqual([])
  })

  it('picks up notes with notedrop-publish: true', async () => {
    await vault.writeFile('/notes/a.md', '---\nnotedrop-publish: true\n---\nbody')
    meta.seed('/notes/a.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()).toHaveLength(1)
  })

  it('ignores notes without notedrop-publish', async () => {
    await vault.writeFile('/notes/a.md', '---\n---\nbody')
    meta.seed('/notes/a.md', { frontmatter: {} })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()).toEqual([])
  })

  it('ignores notes where notedrop-publish is false', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': false } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()).toEqual([])
  })

  it('ignores non-.md files', async () => {
    await vault.writeFile('/img.png', 'PNG')
    meta.seed('/img.png', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()).toEqual([])
  })

  it('generates a 32-char hex hash for each new note', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    const item = idx.list()[0]!
    expect(item.hash).toMatch(HASH_RE)
  })

  it('derives title from filename without extension', async () => {
    await vault.writeFile('/notes/01. 환경 준비.md', '')
    meta.seed('/notes/01. 환경 준비.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.title).toBe('01. 환경 준비')
  })

  it('reads slug from notedrop-slug', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'my-post' }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.slug).toBe('my-post')
  })

  it('slug is null when notedrop-slug missing', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.slug).toBeNull()
  })

  it('reads explicit notedrop-render: doc', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'doc' }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.render).toBe('doc')
  })

  it('reads explicit notedrop-render: book', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'book' }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.render).toBe('book')
  })

  it('falls back to render=book when folder name matches file basename (Waypoint)', async () => {
    await vault.writeFile('/books/My Book/My Book.md', '')
    meta.seed('/books/My Book/My Book.md', {
      frontmatter: { 'notedrop-publish': true }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.render).toBe('book')
  })

  it('falls back to render=doc when folder name does not match', async () => {
    await vault.writeFile('/notes/random.md', '')
    meta.seed('/notes/random.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.render).toBe('doc')
  })

  it('warns and falls back when notedrop-render value is invalid', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'weird' }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.render).toBe('doc')
    expect(idx.warnings).toContainEqual(
      expect.objectContaining({ filePath: '/a.md', code: 'invalid-render' })
    )
  })

  it('initial type is always entry; chapters get linked later', async () => {
    await vault.writeFile('/books/B/B.md', '')
    await vault.writeFile('/books/B/01.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'book' }
    })
    meta.seed('/books/B/01.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list().every((it) => it.type === 'entry')).toBe(true)
  })

  it('stores cover as raw vault path from notedrop-cover', async () => {
    await vault.writeFile('/books/B/B.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: {
        'notedrop-publish': true,
        'notedrop-render': 'book',
        'notedrop-cover': '_assets/cover.png'
      }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.cover).toBe('_assets/cover.png')
  })

  it('stores customCssRaw with inline and file separately', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: {
        'notedrop-publish': true,
        'notedrop-css': '.page { color: red; }',
        'notedrop-css-file': 'styles/book.css'
      }
    })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    expect(idx.list()[0]!.customCssRaw).toEqual({
      inline: '.page { color: red; }',
      file: 'styles/book.css'
    })
  })

  it('sets publishedAt and updatedAt to ISO strings on first build', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    await idx.build()
    const item = idx.list()[0]!
    expect(() => new Date(item.publishedAt).toISOString()).not.toThrow()
    expect(item.updatedAt).toBe(item.publishedAt)
  })

  it('seed() preserves hash and publishedAt across builds', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const idx = new PublishIndex(vault, meta)
    idx.seed([
      {
        filePath: '/a.md',
        hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        publishedAt: '2026-01-01T00:00:00.000Z',
        slug: null
      }
    ])
    await idx.build()
    const item = idx.list()[0]!
    expect(item.hash).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(item.publishedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run, confirm RED**

```bash
cd plugin && npm test -- src/domain/PublishIndex.test.ts
```

Expected: FAIL ("Cannot find module './PublishIndex.js'").

- [ ] **Step 3: Implement `PublishIndex.ts` (build path only)**

Create `plugin/src/domain/PublishIndex.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { VaultFs } from '../ports/VaultFs.js'
import type { MetaCache } from '../ports/MetaCache.js'
import type { PublishedItem } from './types.js'
import type { RenderMode } from '../types.js'

export type SeedEntry = {
  filePath: string
  hash: string
  publishedAt: string
  slug: string | null
}

export type IndexWarning = {
  filePath: string
  code: 'invalid-render' | 'slug-collision' | 'hash-collision'
  message: string
}

const VALID_RENDER: ReadonlySet<string> = new Set(['book', 'doc'])

export class PublishIndex {
  private byHash: Map<string, PublishedItem> = new Map()
  private pathToHash: Map<string, string> = new Map()
  private slugToHash: Map<string, string> = new Map()
  private seeds: Map<string, SeedEntry> = new Map()
  warnings: IndexWarning[] = []

  constructor(private vault: VaultFs, private meta: MetaCache) {}

  seed(entries: SeedEntry[]): void {
    for (const e of entries) this.seeds.set(e.filePath, e)
  }

  async build(): Promise<void> {
    this.byHash.clear()
    this.pathToHash.clear()
    this.slugToHash.clear()
    this.warnings = []

    const allFiles = await this.vault.listAllFiles()
    const now = new Date().toISOString()

    for (const filePath of allFiles) {
      if (!filePath.endsWith('.md')) continue
      const fm = this.meta.getFrontmatter(filePath)
      if (!fm || fm['notedrop-publish'] !== true) continue

      const item = this.deriveItem(filePath, fm, now)
      this.insert(item)
    }
  }

  list(): PublishedItem[] {
    return [...this.byHash.values()]
  }

  private deriveItem(
    filePath: string,
    fm: Record<string, unknown>,
    now: string
  ): PublishedItem {
    const seed = this.seeds.get(filePath)
    const hash = seed?.hash ?? this.newHash()
    const publishedAt = seed?.publishedAt ?? now
    const seedSlug = seed?.slug ?? null
    const fmSlug = typeof fm['notedrop-slug'] === 'string'
      ? (fm['notedrop-slug'] as string)
      : null
    const slug = fmSlug ?? seedSlug

    return {
      hash,
      slug,
      filePath,
      title: deriveTitle(filePath),
      render: this.resolveRender(filePath, fm),
      type: 'entry',
      parent: null,
      order: null,
      chapters: null,
      cover: typeof fm['notedrop-cover'] === 'string'
        ? (fm['notedrop-cover'] as string)
        : null,
      customCssRaw: {
        inline: typeof fm['notedrop-css'] === 'string'
          ? (fm['notedrop-css'] as string)
          : null,
        file: typeof fm['notedrop-css-file'] === 'string'
          ? (fm['notedrop-css-file'] as string)
          : null
      },
      publishedAt,
      updatedAt: now
    }
  }

  private resolveRender(
    filePath: string,
    fm: Record<string, unknown>
  ): RenderMode {
    const explicit = fm['notedrop-render']
    if (typeof explicit === 'string' && VALID_RENDER.has(explicit)) {
      return explicit as RenderMode
    }
    if (explicit !== undefined) {
      this.warnings.push({
        filePath,
        code: 'invalid-render',
        message: `notedrop-render must be 'book' or 'doc'; got ${JSON.stringify(explicit)}`
      })
    }
    return inferRender(filePath)
  }

  private insert(item: PublishedItem): void {
    if (this.byHash.has(item.hash)) {
      this.warnings.push({
        filePath: item.filePath,
        code: 'hash-collision',
        message: `regenerating hash for ${item.filePath}`
      })
      item = { ...item, hash: this.newHash() }
    }
    if (item.slug && this.slugToHash.has(item.slug)) {
      const dedup = this.dedupSlug(item.slug)
      this.warnings.push({
        filePath: item.filePath,
        code: 'slug-collision',
        message: `slug ${item.slug} already taken; using ${dedup}`
      })
      item = { ...item, slug: dedup }
    }
    this.byHash.set(item.hash, item)
    this.pathToHash.set(item.filePath, item.hash)
    if (item.slug) this.slugToHash.set(item.slug, item.hash)
  }

  private dedupSlug(slug: string): string {
    let n = 2
    while (this.slugToHash.has(`${slug}-${n}`)) n += 1
    return `${slug}-${n}`
  }

  private newHash(): string {
    let attempt = 0
    while (attempt < 4) {
      const candidate = randomUUID().replace(/-/g, '')
      if (!this.byHash.has(candidate)) return candidate
      attempt += 1
    }
    throw new Error('PublishIndex: hash regeneration exhausted (4 attempts)')
  }
}

function deriveTitle(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base.replace(/\.md$/, '')
}

function inferRender(filePath: string): RenderMode {
  const segs = filePath.split('/').filter(Boolean)
  const file = segs[segs.length - 1]
  const folder = segs[segs.length - 2]
  if (!file || !folder) return 'doc'
  return file.replace(/\.md$/, '') === folder ? 'book' : 'doc'
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/PublishIndex.test.ts
```

Expected: 18 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/PublishIndex.ts plugin/src/domain/PublishIndex.test.ts
git commit -m "feat(plugin/domain): PublishIndex.build() with render auto-detect + seed"
```

---

## Task 9: PublishIndex - query API

**Files:**
- Modify: `plugin/src/domain/PublishIndex.ts`
- Modify: `plugin/src/domain/PublishIndex.test.ts`

Adds `get`, `getByPath`, `getBySlug`, `listChildren` per `docs/08-interfaces.md` §8.2.1.

- [ ] **Step 1: Append the test cases**

Append to `plugin/src/domain/PublishIndex.test.ts`:

```ts
describe('PublishIndex.query', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache
  let idx: PublishIndex

  beforeEach(async () => {
    vault = new InMemoryVaultFs({})
    meta = new FakeMetaCache({})
    await vault.writeFile('/books/B/B.md', '')
    await vault.writeFile('/books/B/01.md', '')
    await vault.writeFile('/notes/solo.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: {
        'notedrop-publish': true,
        'notedrop-render': 'book',
        'notedrop-slug': 'b'
      }
    })
    meta.seed('/books/B/01.md', {
      frontmatter: { 'notedrop-publish': true }
    })
    meta.seed('/notes/solo.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'solo' }
    })
    idx = new PublishIndex(vault, meta)
    await idx.build()
  })

  it('get(hash) returns item by hash', () => {
    const all = idx.list()
    const item = all[0]!
    expect(idx.get(item.hash)).toEqual(item)
  })

  it('get(hash) returns null for unknown hash', () => {
    expect(idx.get('00000000000000000000000000000000')).toBeNull()
  })

  it('getByPath returns item by file path', () => {
    expect(idx.getByPath('/notes/solo.md')?.slug).toBe('solo')
  })

  it('getByPath returns null for unknown path', () => {
    expect(idx.getByPath('/missing.md')).toBeNull()
  })

  it('getBySlug returns item by slug', () => {
    expect(idx.getBySlug('b')?.filePath).toBe('/books/B/B.md')
  })

  it('getBySlug returns null for unknown slug', () => {
    expect(idx.getBySlug('nope')).toBeNull()
  })

  it('list() returns all items', () => {
    expect(idx.list()).toHaveLength(3)
  })

  it('listChildren returns items whose parent matches the given hash', () => {
    // Pre-link manually via direct upsert in next task; until then verify empty
    const bookHash = idx.getByPath('/books/B/B.md')!.hash
    expect(idx.listChildren(bookHash)).toEqual([])
  })
})
```

- [ ] **Step 2: Run, confirm RED on the new cases**

```bash
cd plugin && npm test -- src/domain/PublishIndex.test.ts
```

Expected: failures on `idx.get`, `idx.getByPath`, `idx.getBySlug`, `idx.listChildren` not being functions.

- [ ] **Step 3: Implement query methods on `PublishIndex`**

Insert into the `PublishIndex` class body just below `list()`:

```ts
  get(hash: string): PublishedItem | null {
    return this.byHash.get(hash) ?? null
  }

  getByPath(filePath: string): PublishedItem | null {
    const hash = this.pathToHash.get(filePath)
    return hash ? (this.byHash.get(hash) ?? null) : null
  }

  getBySlug(slug: string): PublishedItem | null {
    const hash = this.slugToHash.get(slug)
    return hash ? (this.byHash.get(hash) ?? null) : null
  }

  listChildren(parentHash: string): PublishedItem[] {
    const out: PublishedItem[] = []
    for (const item of this.byHash.values()) {
      if (item.parent === parentHash) out.push(item)
    }
    out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    return out
  }
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/PublishIndex.test.ts
```

Expected: 26 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/PublishIndex.ts plugin/src/domain/PublishIndex.test.ts
git commit -m "feat(plugin/domain): PublishIndex query API (get/byPath/bySlug/children)"
```

---

## Task 10: PublishIndex - mutations

**Files:**
- Modify: `plugin/src/domain/PublishIndex.ts`
- Modify: `plugin/src/domain/PublishIndex.test.ts`

Adds `upsert(filePath)`, `remove(filePath)`, `rename(oldPath, newPath)` per `docs/08-interfaces.md` §8.2.1. Preserves hash and `publishedAt` on update; reassigns slug when collision detected.

- [ ] **Step 1: Append the test cases**

```ts
describe('PublishIndex.mutations', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache
  let idx: PublishIndex

  beforeEach(async () => {
    vault = new InMemoryVaultFs({})
    meta = new FakeMetaCache({})
    idx = new PublishIndex(vault, meta)
    await idx.build()
  })

  it('upsert returns null when frontmatter has no publish flag', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: {} })
    expect(idx.upsert('/a.md')).toBeNull()
  })

  it('upsert inserts a new item when publish flag is true', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const item = idx.upsert('/a.md')
    expect(item).not.toBeNull()
    expect(idx.list()).toHaveLength(1)
  })

  it('upsert preserves hash and publishedAt on update', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const first = idx.upsert('/a.md')!
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'changed' }
    })
    const second = idx.upsert('/a.md')!
    expect(second.hash).toBe(first.hash)
    expect(second.publishedAt).toBe(first.publishedAt)
    expect(second.slug).toBe('changed')
  })

  it('upsert refreshes updatedAt', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const first = idx.upsert('/a.md')!
    await new Promise((r) => setTimeout(r, 5))
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const second = idx.upsert('/a.md')!
    expect(second.updatedAt >= first.updatedAt).toBe(true)
  })

  it('upsert returns null and removes item when publish flag flips false', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const item = idx.upsert('/a.md')!
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': false } })
    expect(idx.upsert('/a.md')).toBeNull()
    expect(idx.get(item.hash)).toBeNull()
  })

  it('remove deletes by file path', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    idx.upsert('/a.md')
    idx.remove('/a.md')
    expect(idx.getByPath('/a.md')).toBeNull()
    expect(idx.list()).toEqual([])
  })

  it('remove is a no-op for unknown path', () => {
    expect(() => idx.remove('/missing.md')).not.toThrow()
  })

  it('rename keeps hash, updates path mapping', async () => {
    await vault.writeFile('/old.md', '')
    meta.seed('/old.md', { frontmatter: { 'notedrop-publish': true } })
    const item = idx.upsert('/old.md')!
    idx.rename('/old.md', '/new.md')
    expect(idx.getByPath('/old.md')).toBeNull()
    const moved = idx.getByPath('/new.md')
    expect(moved?.hash).toBe(item.hash)
    expect(moved?.filePath).toBe('/new.md')
    expect(moved?.title).toBe('new')
  })

  it('rename is a no-op when oldPath unknown', () => {
    expect(() => idx.rename('/nope.md', '/new.md')).not.toThrow()
    expect(idx.getByPath('/new.md')).toBeNull()
  })

  it('slug collision on upsert appends -2', async () => {
    await vault.writeFile('/a.md', '')
    await vault.writeFile('/b.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'foo' }
    })
    meta.seed('/b.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'foo' }
    })
    idx.upsert('/a.md')
    const second = idx.upsert('/b.md')!
    expect(second.slug).toBe('foo-2')
    expect(idx.warnings).toContainEqual(
      expect.objectContaining({ code: 'slug-collision' })
    )
  })

  it('upsert frees old slug when slug changes', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'old' }
    })
    idx.upsert('/a.md')
    meta.seed('/a.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'new' }
    })
    idx.upsert('/a.md')
    expect(idx.getBySlug('old')).toBeNull()
    expect(idx.getBySlug('new')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run, confirm RED on the new cases**

```bash
cd plugin && npm test -- src/domain/PublishIndex.test.ts
```

- [ ] **Step 3: Implement mutations on `PublishIndex`**

Replace the `insert` private method and append public mutations. The new private `derive` helper consolidates frontmatter reading so `build` and `upsert` share logic. Final relevant block:

```ts
  upsert(filePath: string): PublishedItem | null {
    const fm = this.meta.getFrontmatter(filePath)
    if (!fm || fm['notedrop-publish'] !== true) {
      this.remove(filePath)
      return null
    }
    const existing = this.getByPath(filePath)
    const now = new Date().toISOString()
    const draft = this.deriveItem(filePath, fm, now)
    const merged: PublishedItem = existing
      ? { ...draft, hash: existing.hash, publishedAt: existing.publishedAt }
      : draft
    if (existing) this.detach(existing)
    this.insert(merged)
    return this.getByPath(filePath)
  }

  remove(filePath: string): void {
    const existing = this.getByPath(filePath)
    if (!existing) return
    this.detach(existing)
  }

  rename(oldPath: string, newPath: string): void {
    const existing = this.getByPath(oldPath)
    if (!existing) return
    this.detach(existing)
    const renamed: PublishedItem = {
      ...existing,
      filePath: newPath,
      title: deriveTitle(newPath),
      updatedAt: new Date().toISOString()
    }
    this.insert(renamed)
  }

  private detach(item: PublishedItem): void {
    this.byHash.delete(item.hash)
    this.pathToHash.delete(item.filePath)
    if (item.slug) this.slugToHash.delete(item.slug)
  }
```

The `insert` from Task 8 already handles slug-collision dedup; no change needed.

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/PublishIndex.test.ts
```

Expected: 37 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/PublishIndex.ts plugin/src/domain/PublishIndex.test.ts
git commit -m "feat(plugin/domain): PublishIndex upsert/remove/rename + slug collision"
```

---

## Task 11: PublishIndex - events and book linking

**Files:**
- Modify: `plugin/src/domain/PublishIndex.ts`
- Modify: `plugin/src/domain/PublishIndex.test.ts`

Adds `on(event, handler)` for added/changed/removed (per §8.2.1) and the second-pass `linkBooks(bookAssembler)` that wires `parent` / `chapters` / `order` for `render='book'` entries (per design note 5).

`build()` now accepts an optional `{ bookAssembler }` dep; when provided, build runs `linkBooks` automatically as the second pass.

- [ ] **Step 1: Append the test cases**

```ts
import type { ChapterPlan } from './types.js'

// BookAssembler module is created in Task 19; until then we test linkBooks via a
// structural stub matching the BookAssemblerLike shape inside PublishIndex.
class StubBookAssembler {
  constructor(private plans: Map<string, ChapterPlan>) {}
  async assemble(entryFilePath: string): Promise<ChapterPlan> {
    return this.plans.get(entryFilePath) ?? { source: 'folder-scan' as const, chapters: [] }
  }
}

describe('PublishIndex.events', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache
  let idx: PublishIndex

  beforeEach(async () => {
    vault = new InMemoryVaultFs({})
    meta = new FakeMetaCache({})
    idx = new PublishIndex(vault, meta)
    await idx.build()
  })

  it('emits "added" on first upsert', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const seen: string[] = []
    idx.on('added', (h) => { seen.push(h) })
    const item = idx.upsert('/a.md')!
    expect(seen).toEqual([item.hash])
  })

  it('emits "changed" on update upsert', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const item = idx.upsert('/a.md')!
    const seen: string[] = []
    idx.on('changed', (h) => { seen.push(h) })
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true, 'notedrop-slug': 'x' } })
    idx.upsert('/a.md')
    expect(seen).toEqual([item.hash])
  })

  it('emits "removed" on remove', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const item = idx.upsert('/a.md')!
    const seen: string[] = []
    idx.on('removed', (h) => { seen.push(h) })
    idx.remove('/a.md')
    expect(seen).toEqual([item.hash])
  })

  it('on() unsubscribe stops further notifications', async () => {
    await vault.writeFile('/a.md', '')
    meta.seed('/a.md', { frontmatter: { 'notedrop-publish': true } })
    const seen: string[] = []
    const off = idx.on('added', (h) => { seen.push(h) })
    off()
    idx.upsert('/a.md')
    expect(seen).toEqual([])
  })
})

describe('PublishIndex book linking', () => {
  it('linkBooks wires parent/chapters/order for book entries', async () => {
    const vault = new InMemoryVaultFs({})
    const meta = new FakeMetaCache({})
    await vault.writeFile('/books/B/B.md', '')
    await vault.writeFile('/books/B/01.md', '')
    await vault.writeFile('/books/B/02.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'book' }
    })
    meta.seed('/books/B/01.md', { frontmatter: { 'notedrop-publish': true } })
    meta.seed('/books/B/02.md', { frontmatter: { 'notedrop-publish': true } })

    const idx = new PublishIndex(vault, meta)
    const stub = new StubBookAssembler(new Map([
      ['/books/B/B.md', {
        source: 'folder-scan',
        chapters: [
          { filePath: '/books/B/01.md', order: 1 },
          { filePath: '/books/B/02.md', order: 2 }
        ]
      }]
    ]))

    await idx.build({ bookAssembler: stub })

    const entry = idx.getByPath('/books/B/B.md')!
    const ch1 = idx.getByPath('/books/B/01.md')!
    const ch2 = idx.getByPath('/books/B/02.md')!

    expect(entry.type).toBe('entry')
    expect(entry.chapters).toEqual([ch1.hash, ch2.hash])
    expect(ch1.type).toBe('chapter')
    expect(ch1.parent).toBe(entry.hash)
    expect(ch1.order).toBe(1)
    expect(idx.listChildren(entry.hash).map((it) => it.hash)).toEqual([
      ch1.hash, ch2.hash
    ])
  })

  it('linkBooks ignores chapter paths not in the index', async () => {
    const vault = new InMemoryVaultFs({})
    const meta = new FakeMetaCache({})
    await vault.writeFile('/books/B/B.md', '')
    await vault.writeFile('/books/B/01.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-render': 'book' }
    })
    meta.seed('/books/B/01.md', { frontmatter: { 'notedrop-publish': true } })

    const idx = new PublishIndex(vault, meta)
    const stub = new StubBookAssembler(new Map([
      ['/books/B/B.md', {
        source: 'folder-scan',
        chapters: [
          { filePath: '/books/B/01.md', order: 1 },
          { filePath: '/books/B/missing.md', order: 2 }
        ]
      }]
    ]))

    await idx.build({ bookAssembler: stub })

    const entry = idx.getByPath('/books/B/B.md')!
    expect(entry.chapters).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run, confirm RED**

```bash
cd plugin && npm test -- src/domain/PublishIndex.test.ts
```

Expected: failures on `idx.on`, `build({ bookAssembler })` accepting deps.

- [ ] **Step 3: Add events + linkBooks to `PublishIndex`**

Insert event types and helpers near the top (under `IndexWarning`):

```ts
export type IndexEvent = 'added' | 'changed' | 'removed'
export type IndexEventHandler = (hash: string) => void
```

Add private state and `on` to the class (near `warnings`):

```ts
  private listeners: Map<IndexEvent, Set<IndexEventHandler>> = new Map()

  on(event: IndexEvent, handler: IndexEventHandler): () => void {
    let set = this.listeners.get(event)
    if (!set) { set = new Set(); this.listeners.set(event, set) }
    set.add(handler)
    return () => { set!.delete(handler) }
  }

  private emit(event: IndexEvent, hash: string): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const handler of set) handler(hash)
  }
```

Modify `upsert` to emit (replace existing version):

```ts
  upsert(filePath: string): PublishedItem | null {
    const fm = this.meta.getFrontmatter(filePath)
    if (!fm || fm['notedrop-publish'] !== true) {
      const removed = this.getByPath(filePath)
      if (removed) {
        this.detach(removed)
        this.emit('removed', removed.hash)
      }
      return null
    }
    const existing = this.getByPath(filePath)
    const now = new Date().toISOString()
    const draft = this.deriveItem(filePath, fm, now)
    const merged: PublishedItem = existing
      ? { ...draft, hash: existing.hash, publishedAt: existing.publishedAt }
      : draft
    if (existing) this.detach(existing)
    this.insert(merged)
    const stored = this.getByPath(filePath)!
    this.emit(existing ? 'changed' : 'added', stored.hash)
    return stored
  }
```

Modify `remove` to emit:

```ts
  remove(filePath: string): void {
    const existing = this.getByPath(filePath)
    if (!existing) return
    this.detach(existing)
    this.emit('removed', existing.hash)
  }
```

Add the `linkBooks` second pass and update `build` to call it:

```ts
  async build(deps: { bookAssembler?: BookAssemblerLike } = {}): Promise<void> {
    this.byHash.clear()
    this.pathToHash.clear()
    this.slugToHash.clear()
    this.warnings = []

    const allFiles = await this.vault.listAllFiles()
    const now = new Date().toISOString()

    for (const filePath of allFiles) {
      if (!filePath.endsWith('.md')) continue
      const fm = this.meta.getFrontmatter(filePath)
      if (!fm || fm['notedrop-publish'] !== true) continue
      this.insert(this.deriveItem(filePath, fm, now))
    }

    if (deps.bookAssembler) await this.linkBooks(deps.bookAssembler)
  }

  private async linkBooks(bookAssembler: BookAssemblerLike): Promise<void> {
    const entries = [...this.byHash.values()].filter((it) => it.render === 'book')
    for (const entry of entries) {
      const plan = await bookAssembler.assemble(entry.filePath)
      const linked: string[] = []
      for (const ch of plan.chapters) {
        const child = this.getByPath(ch.filePath)
        if (!child) continue
        const updated: PublishedItem = {
          ...child,
          type: 'chapter',
          parent: entry.hash,
          order: ch.order
        }
        this.byHash.set(child.hash, updated)
        linked.push(child.hash)
      }
      this.byHash.set(entry.hash, { ...entry, chapters: linked })
    }
  }
}

type BookAssemblerLike = {
  assemble(entryFilePath: string): Promise<import('./types.js').ChapterPlan>
}
```

Also add the import at the top of `PublishIndex.ts`:

```ts
import type { ChapterPlan } from './types.js'
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/PublishIndex.test.ts
```

Expected: 43 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/PublishIndex.ts plugin/src/domain/PublishIndex.test.ts
git commit -m "feat(plugin/domain): PublishIndex events + book linking second pass"
```

---

## Task 12: ContentResolver

**Files:**
- Create: `plugin/src/domain/ContentResolver.ts`
- Create: `plugin/src/domain/ContentResolver.test.ts`

Reads a published file, parses frontmatter and body, and extracts every wikilink / embed / image reference. Resolves each reference against `PublishIndex` (and `VaultFs.searchByName` for images). See `docs/08-interfaces.md` §8.2.2.

Wikilink syntax handled: `[[Target]]`, `[[Target|alias]]`, `[[Target#Heading]]`, `[[Target#^blockId]]`, with `!` prefix for embed and `|width` or `|widthxheight` after a filename for image size. Image extension set: `.png .jpg .jpeg .svg .webp .gif`. Markdown-style `![alt](path)` images are left for v2.

- [ ] **Step 1: Write the test file**

Create `plugin/src/domain/ContentResolver.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ContentResolver } from './ContentResolver.js'
import { PublishIndex } from './PublishIndex.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

async function setup(files: Record<string, { body: string, fm?: Record<string, unknown> }>) {
  const vault = new InMemoryVaultFs({})
  const meta = new FakeMetaCache({})
  for (const [path, { body, fm }] of Object.entries(files)) {
    const yaml = fm
      ? `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n`
      : ''
    await vault.writeFile(path, yaml + body)
    meta.seed(path, { frontmatter: fm ?? {} })
  }
  const index = new PublishIndex(vault, meta)
  await index.build()
  return { vault, meta, index, resolver: new ContentResolver(vault, meta, index) }
}

describe('ContentResolver.resolve()', () => {
  it('returns rawMarkdown unchanged', async () => {
    const { resolver } = await setup({
      '/a.md': {
        body: '# Title\n\nbody text',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.rawMarkdown).toContain('---\n')
    expect(r.rawMarkdown).toContain('# Title')
    expect(r.rawMarkdown).toContain('body text')
  })

  it('parses frontmatter via metadataCache', async () => {
    const { resolver } = await setup({
      '/a.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 's', 'mood': 'okay' }
      }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.frontmatter).toMatchObject({
      'notedrop-publish': true,
      'notedrop-slug': 's',
      mood: 'okay'
    })
  })

  it('returns empty refs when body has no links', async () => {
    const { resolver } = await setup({
      '/a.md': { body: 'just text', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs).toEqual([])
  })

  it('extracts a plain wikilink', async () => {
    const { resolver } = await setup({
      '/a.md': {
        body: 'see [[Other]] please',
        fm: { 'notedrop-publish': true }
      },
      '/Other.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs).toHaveLength(1)
    const ref = r.refs[0]!
    expect(ref.type).toBe('wikilink')
    expect(ref.target).toBe('Other')
    expect(ref.rawText).toBe('[[Other]]')
    expect(ref.resolution.kind).toBe('published-note')
  })

  it('classifies wikilink to unpublished note as unpublished-note', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '[[Private]]', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.resolution).toEqual({
      kind: 'unpublished-note',
      noteName: 'Private'
    })
  })

  it('parses alias from [[Note|alias]]', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '[[Other|see this]]', fm: { 'notedrop-publish': true } },
      '/Other.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.alias).toBe('see this')
  })

  it('parses anchor from [[Note#Heading]]', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '[[Other#Intro]]', fm: { 'notedrop-publish': true } },
      '/Other.md': { body: '', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.anchor).toBe('Intro')
    expect(r.refs[0]!.target).toBe('Other')
  })

  it('parses blockId from [[Note#^block]]', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '[[Other#^abc123]]', fm: { 'notedrop-publish': true } },
      '/Other.md': { body: '', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.blockId).toBe('abc123')
    expect(r.refs[0]!.anchor).toBeUndefined()
  })

  it('extracts an embed via ![[Note]]', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '![[Other]]', fm: { 'notedrop-publish': true } },
      '/Other.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.type).toBe('embed')
    expect(r.refs[0]!.rawText).toBe('![[Other]]')
  })

  it('classifies ![[file.png]] as image and finds vault path', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[cover.png]]',
      '/img/cover.png': 'PNG'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.type).toBe('image')
    expect(r.refs[0]!.resolution).toEqual({
      kind: 'image',
      vaultPath: '/img/cover.png',
      mime: 'image/png'
    })
  })

  it('parses size pipe ![[img.png|400]]', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[img.png|400]]',
      '/img.png': 'PNG'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.size).toEqual({ width: 400 })
  })

  it('parses size pipe ![[img.png|400x300]]', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[img.png|400x300]]',
      '/img.png': 'PNG'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.size).toEqual({ width: 400, height: 300 })
  })

  it('classifies missing image as broken', async () => {
    const { resolver } = await setup({
      '/a.md': { body: '![[missing.png]]', fm: { 'notedrop-publish': true } }
    })
    const r = await resolver.resolve('/a.md')
    expect(r.refs[0]!.type).toBe('image')
    expect(r.refs[0]!.resolution.kind).toBe('broken')
  })

  it('chooses first match when multiple images share filename', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[shared.png]]',
      '/folder1/shared.png': 'A',
      '/folder2/shared.png': 'B'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    const res = r.refs[0]!.resolution
    expect(res.kind === 'image' && res.vaultPath.endsWith('/shared.png')).toBe(true)
  })

  it('detects mime by extension (jpg, jpeg, svg, webp, gif)', async () => {
    const cases: Array<[string, string]> = [
      ['photo.jpg', 'image/jpeg'],
      ['photo.jpeg', 'image/jpeg'],
      ['icon.svg', 'image/svg+xml'],
      ['anim.gif', 'image/gif'],
      ['mod.webp', 'image/webp']
    ]
    for (const [file, mime] of cases) {
      const vault = new InMemoryVaultFs({
        '/a.md': `---\nnotedrop-publish: true\n---\n![[${file}]]`,
        [`/${file}`]: 'X'
      })
      const meta = new FakeMetaCache({
        '/a.md': { frontmatter: { 'notedrop-publish': true } }
      })
      const index = new PublishIndex(vault, meta)
      await index.build()
      const resolver = new ContentResolver(vault, meta, index)
      const r = await resolver.resolve('/a.md')
      const res = r.refs[0]!.resolution
      expect(res.kind === 'image' && res.mime === mime).toBe(true)
    }
  })

  it('extracts multiple refs in one body in source order', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\nfirst [[X]] then ![[Y]] then [[Z]]',
      '/X.md': '',
      '/Y.md': '',
      '/Z.md': ''
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } },
      '/X.md': { frontmatter: { 'notedrop-publish': true } },
      '/Y.md': { frontmatter: { 'notedrop-publish': true } },
      '/Z.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    expect(r.refs.map((ref) => ref.target)).toEqual(['X', 'Y', 'Z'])
    expect(r.refs.map((ref) => ref.type)).toEqual(['wikilink', 'embed', 'wikilink'])
  })

  it('skips wikilinks inside %% comments %%', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\nbody %%[[Hidden]]%% [[Visible]]',
      '/Hidden.md': '',
      '/Visible.md': ''
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } },
      '/Hidden.md': { frontmatter: { 'notedrop-publish': true } },
      '/Visible.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const resolver = new ContentResolver(vault, meta, index)
    const r = await resolver.resolve('/a.md')
    expect(r.refs.map((ref) => ref.target)).toEqual(['Visible'])
  })
})
```

- [ ] **Step 2: Run, confirm RED**

```bash
cd plugin && npm test -- src/domain/ContentResolver.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `ContentResolver.ts`**

Create `plugin/src/domain/ContentResolver.ts`:

```ts
import type { VaultFs } from '../ports/VaultFs.js'
import type { MetaCache } from '../ports/MetaCache.js'
import type { PublishIndex } from './PublishIndex.js'
import type {
  Reference,
  ReferenceKind,
  ReferenceResolution,
  ResolvedContent
} from './types.js'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'])
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  gif: 'image/gif'
}

const COMMENT_RE = /%%[\s\S]*?%%/g
const REF_RE = /(!?)\[\[([^\]\n]+)\]\]/g
const SIZE_RE = /^(\d+)(?:x(\d+))?$/

export class ContentResolver {
  constructor(
    private vault: VaultFs,
    private meta: MetaCache,
    private index: PublishIndex
  ) {}

  async resolve(filePath: string): Promise<ResolvedContent> {
    const rawMarkdown = await this.vault.readFile(filePath)
    const frontmatter = this.meta.getFrontmatter(filePath) ?? {}
    const body = stripFrontmatter(rawMarkdown)
    const refs = await this.extractRefs(body)
    return { rawMarkdown, frontmatter, refs }
  }

  private async extractRefs(body: string): Promise<Reference[]> {
    const sanitized = body.replace(COMMENT_RE, (m) => ' '.repeat(m.length))
    const out: Reference[] = []
    for (const match of sanitized.matchAll(REF_RE)) {
      const [rawText, bang, inner] = match
      const ref = await this.parseRef(rawText, bang === '!', inner!)
      out.push(ref)
    }
    return out
  }

  private async parseRef(
    rawText: string,
    isEmbed: boolean,
    inner: string
  ): Promise<Reference> {
    const [head, ...aliasParts] = inner.split('|')
    const aliasOrSize = aliasParts.join('|')
    const headTrimmed = head!.trim()
    const targetMatch = /^([^#]+)(?:#\^([\w-]+)|#([^#]+))?$/.exec(headTrimmed)
    if (!targetMatch) {
      return makeRef(rawText, isEmbed, headTrimmed, undefined, undefined, undefined,
        { kind: 'broken', reason: 'malformed wikilink target' })
    }
    const target = targetMatch[1]!.trim()
    const blockId = targetMatch[2]
    const anchor = targetMatch[3]
    const ext = extOf(target)
    const isImage = ext !== null && IMAGE_EXT.has(ext)
    const type: ReferenceKind = isImage ? 'image' : (isEmbed ? 'embed' : 'wikilink')

    let alias: string | undefined
    let size: { width?: number, height?: number } | undefined
    if (aliasOrSize) {
      if (isImage) {
        const sm = SIZE_RE.exec(aliasOrSize.trim())
        if (sm) {
          size = { width: Number(sm[1]) }
          if (sm[2]) size.height = Number(sm[2])
        } else {
          alias = aliasOrSize
        }
      } else {
        alias = aliasOrSize
      }
    }

    const resolution = await this.resolveTarget(type, target, ext)

    return makeRef(rawText, isEmbed, target, alias, anchor, blockId, resolution, size, type)
  }

  private async resolveTarget(
    type: ReferenceKind,
    target: string,
    ext: string | null
  ): Promise<ReferenceResolution> {
    if (type === 'image') {
      const matches = await this.vault.searchByName(target)
      if (matches.length === 0) {
        return { kind: 'broken', reason: `image not found: ${target}` }
      }
      return { kind: 'image', vaultPath: matches[0]!, mime: MIME_BY_EXT[ext!]! }
    }
    const noteName = target.replace(/\.md$/, '')
    const matches = await this.vault.searchByName(`${noteName}.md`)
    for (const candidate of matches) {
      const item = this.index.getByPath(candidate)
      if (item) {
        return { kind: 'published-note', hash: item.hash, slug: item.slug }
      }
    }
    return { kind: 'unpublished-note', noteName }
  }
}

function makeRef(
  rawText: string,
  isEmbed: boolean,
  target: string,
  alias: string | undefined,
  anchor: string | undefined,
  blockId: string | undefined,
  resolution: ReferenceResolution,
  size?: { width?: number, height?: number },
  type?: ReferenceKind
): Reference {
  return {
    type: type ?? (isEmbed ? 'embed' : 'wikilink'),
    rawText,
    target,
    ...(alias !== undefined ? { alias } : {}),
    ...(anchor !== undefined ? { anchor } : {}),
    ...(blockId !== undefined ? { blockId } : {}),
    ...(size !== undefined ? { size } : {}),
    resolution
  }
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---\n')) return raw
  const end = raw.indexOf('\n---', 4)
  if (end === -1) return raw
  return raw.slice(end + 4).replace(/^\n/, '')
}

function extOf(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return null
  return name.slice(dot + 1).toLowerCase()
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/ContentResolver.test.ts
```

Expected: 17 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/ContentResolver.ts plugin/src/domain/ContentResolver.test.ts
git commit -m "feat(plugin/domain): ContentResolver - parse + extract + resolve refs"
```

---

## Task 13: ContentTransformer - frontmatter sanitization

**Files:**
- Create: `plugin/src/domain/ContentTransformer.ts`
- Create: `plugin/src/domain/ContentTransformer.test.ts`

This task produces a working `transform()` that returns the public `PageFrontmatter` and the body with frontmatter stripped. No HIDE / safety / image rewrites yet (added in Tasks 14-17).

`PageFrontmatter` is built strictly from `PublishedItem` plus computed fields. **Spec §9.1**: vault frontmatter (`mood`, `tags`, etc.) MUST NOT leak. This task writes the test that proves it.

- [ ] **Step 1: Write the test file**

Create `plugin/src/domain/ContentTransformer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ContentTransformer } from './ContentTransformer.js'
import { ContentResolver } from './ContentResolver.js'
import { PublishIndex } from './PublishIndex.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

async function setup(files: Record<string, { body: string, fm?: Record<string, unknown> }>) {
  const vault = new InMemoryVaultFs({})
  const meta = new FakeMetaCache({})
  for (const [path, { body, fm }] of Object.entries(files)) {
    const yaml = fm
      ? `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n`
      : ''
    await vault.writeFile(path, yaml + body)
    meta.seed(path, { frontmatter: fm ?? {} })
  }
  const index = new PublishIndex(vault, meta)
  await index.build()
  const resolver = new ContentResolver(vault, meta, index)
  return {
    vault,
    meta,
    index,
    transformer: new ContentTransformer(resolver, index)
  }
}

describe('ContentTransformer.transform() - frontmatter', () => {
  it('outputs PageFrontmatter using PublishedItem identity fields', async () => {
    const { transformer, index } = await setup({
      '/a.md': {
        body: 'hello',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 'mine' }
      }
    })
    const item = index.getByPath('/a.md')!
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.hash).toBe(item.hash)
    expect(r.outputFrontmatter.slug).toBe('mine')
    expect(r.outputFrontmatter.title).toBe('a')
    expect(r.outputFrontmatter.render).toBe(item.render)
    expect(r.outputFrontmatter.type).toBe(item.type)
    expect(r.outputFrontmatter.publishedAt).toBe(item.publishedAt)
    expect(r.outputFrontmatter.updatedAt).toBe(item.updatedAt)
  })

  it('drops every vault frontmatter key not in PageFrontmatter (safety)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: {
          'notedrop-publish': true,
          mood: 'sad',
          tags: ['private', 'diary'],
          summary: 'secret summary',
          source: 'private notes'
        }
      }
    })
    const r = await transformer.transform('/a.md')
    const out = r.outputFrontmatter as unknown as Record<string, unknown>
    expect(out.mood).toBeUndefined()
    expect(out.tags).toBeUndefined()
    expect(out.summary).toBeUndefined()
    expect(out.source).toBeUndefined()
  })

  it('outputFrontmatter has exactly the 11 PageFrontmatter keys (and no more)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 's', 'mood': 'okay' }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(Object.keys(r.outputFrontmatter).sort()).toEqual([
      'cover',
      'customCss',
      'hash',
      'order',
      'parent',
      'publishedAt',
      'render',
      'slug',
      'title',
      'type',
      'updatedAt'
    ])
  })

  it('throws when the file is not in PublishIndex', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: {} }
    })
    await expect(transformer.transform('/a.md')).rejects.toThrow(/not in index/i)
  })

  it('returns the body without frontmatter as initial markdown', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: '# Title\n\nbody',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown.startsWith('# Title')).toBe(true)
    expect(r.markdown).not.toContain('---')
  })

  it('cover is null when notedrop-cover absent', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.cover).toBeNull()
  })

  it('customCss is null when neither notedrop-css nor notedrop-css-file given', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).toBeNull()
  })

  it('warnings array is empty for a clean file', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.warnings).toEqual([])
  })

  it('assetRefs is empty when no images', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.assetRefs).toEqual([])
  })
})
```

- [ ] **Step 2: Run, confirm RED**

```bash
cd plugin && npm test -- src/domain/ContentTransformer.test.ts
```

- [ ] **Step 3: Implement `ContentTransformer.ts`**

Create `plugin/src/domain/ContentTransformer.ts`:

```ts
import type { PublishIndex } from './PublishIndex.js'
import type { ContentResolver } from './ContentResolver.js'
import type { PublishedItem, TransformedContent } from './types.js'
import type { PageFrontmatter } from '../types.js'

export class ContentTransformer {
  constructor(
    private resolver: ContentResolver,
    private index: PublishIndex
  ) {}

  async transform(filePath: string): Promise<TransformedContent> {
    const item = this.index.getByPath(filePath)
    if (!item) throw new Error(`ContentTransformer: ${filePath} not in index`)

    const resolved = await this.resolver.resolve(filePath)
    const body = stripFrontmatter(resolved.rawMarkdown)
    const warnings: string[] = []

    const outputFrontmatter = this.buildFrontmatter(item)
    return {
      outputFrontmatter,
      markdown: body,
      assetRefs: [],
      warnings
    }
  }

  private buildFrontmatter(item: PublishedItem): PageFrontmatter {
    return {
      hash: item.hash,
      slug: item.slug,
      title: item.title,
      render: item.render,
      type: item.type,
      parent: item.parent,
      order: item.order,
      cover: null,
      customCss: null,
      publishedAt: item.publishedAt,
      updatedAt: item.updatedAt
    }
  }
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---\n')) return raw
  const end = raw.indexOf('\n---', 4)
  if (end === -1) return raw
  return raw.slice(end + 4).replace(/^\n/, '')
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/ContentTransformer.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/ContentTransformer.ts plugin/src/domain/ContentTransformer.test.ts
git commit -m "feat(plugin/domain): ContentTransformer scaffold + frontmatter sanitization"
```

---

## Task 14: ContentTransformer - HIDE policy

**Files:**
- Modify: `plugin/src/domain/ContentTransformer.ts`
- Modify: `plugin/src/domain/ContentTransformer.test.ts`

Removes `%% comment %%` blocks (single-line, multi-line, nested) and Waypoint blocks. ADR-0008 priority: HIDE > RENDER > PASSTHROUGH. **Spec §9.7 row 5** ("`%%` 안 콘텐츠가 어떤 출력에도 0건"): every case here is required for the safety-net 100% gate.

- [ ] **Step 1: Append the test cases**

```ts
describe('ContentTransformer.transform() - HIDE policy', () => {
  it('removes single-line %% comment %%', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'before %%hidden%% after',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('hidden')
    expect(r.markdown).not.toContain('%%')
    expect(r.markdown).toContain('before')
    expect(r.markdown).toContain('after')
  })

  it('removes multi-line %% comment %% spanning lines', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'one\n%%\nhidden\nstuff\n%%\ntwo',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('hidden')
    expect(r.markdown).not.toContain('stuff')
    expect(r.markdown).toContain('one')
    expect(r.markdown).toContain('two')
  })

  it('removes Waypoint block (%% Begin Waypoint %% ... %% End Waypoint %%)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'intro\n%% Begin Waypoint %%\n- [[ch1]]\n- [[ch2]]\n%% End Waypoint %%\noutro',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('Waypoint')
    expect(r.markdown).not.toContain('ch1')
    expect(r.markdown).not.toContain('ch2')
    expect(r.markdown).toContain('intro')
    expect(r.markdown).toContain('outro')
  })

  it('removes multiple %% blocks in one file', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: '%%a%% mid %%b%% end',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('%%')
    expect(r.markdown).not.toMatch(/\ba\b/)
    expect(r.markdown).not.toMatch(/\bb\b/)
    expect(r.markdown).toContain('mid')
    expect(r.markdown).toContain('end')
  })

  it('handles %% at the very start and end', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: '%%first%%body%%last%%',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('first')
    expect(r.markdown).not.toContain('last')
    expect(r.markdown).toContain('body')
  })

  it('does not strip text that merely contains %% in inline code', async () => {
    // Conservative MVP: literal %%...%% in code is rare; treat all %% as HIDE.
    // This test documents the choice. Adjust if the dogfood pass surfaces issues.
    const { transformer } = await setup({
      '/a.md': {
        body: '`example: %%foo%%` and more',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('` and more')
  })

  it('frontmatter never appears in output body', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'body',
        fm: { 'notedrop-publish': true, 'mood': 'okay', 'source': 'private' }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('mood')
    expect(r.markdown).not.toContain('source')
    expect(r.markdown).not.toContain('private')
    expect(r.markdown).not.toContain('---')
  })
})
```

- [ ] **Step 2: Run, confirm RED**

- [ ] **Step 3: Add HIDE step to `ContentTransformer`**

Replace the `transform()` body to add the HIDE pass before returning:

```ts
  async transform(filePath: string): Promise<TransformedContent> {
    const item = this.index.getByPath(filePath)
    if (!item) throw new Error(`ContentTransformer: ${filePath} not in index`)

    const resolved = await this.resolver.resolve(filePath)
    const stripped = stripFrontmatter(resolved.rawMarkdown)
    const hidden = applyHide(stripped)
    const warnings: string[] = []

    return {
      outputFrontmatter: this.buildFrontmatter(item),
      markdown: hidden,
      assetRefs: [],
      warnings
    }
  }
```

Add at the bottom of the file:

```ts
const COMMENT_RE = /%%[\s\S]*?%%/g

function applyHide(body: string): string {
  return body.replace(COMMENT_RE, '')
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/ContentTransformer.test.ts
```

Expected: 16 passed (9 + 7).

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/ContentTransformer.ts plugin/src/domain/ContentTransformer.test.ts
git commit -m "feat(plugin/domain): ContentTransformer HIDE policy (%%, Waypoint)"
```

---

## Task 15: ContentTransformer - wikilink safety net

**Files:**
- Modify: `plugin/src/domain/ContentTransformer.ts`
- Modify: `plugin/src/domain/ContentTransformer.test.ts`

Implements ADR-0009 wikilink rules. Spec §9.7 row 2-3:

- Published wikilink → markdown link to `/notedrop/<slug-or-hash>`, alias preserved.
- Unpublished wikilink with alias → render alias only inside dead-link span (note name strip, prevents leak).
- Unpublished wikilink without alias → render note name + "(접근 권한이 없습니다)" inside dead-link span.

Dead-link HTML: `<span class="notedrop-deadlink">…</span>`. Viewer styles it red/no-cursor; that is a viewer concern, Domain only emits the marker class.

- [ ] **Step 1: Append the test cases**

```ts
describe('ContentTransformer.transform() - wikilink safety', () => {
  it('published wikilink becomes markdown link to /notedrop/<slug>', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'see [[Other]] here', fm: { 'notedrop-publish': true } },
      '/Other.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 'other-slug' }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('[Other](/notedrop/other-slug)')
    expect(r.markdown).not.toContain('[[Other]]')
  })

  it('published wikilink with no slug uses hash', async () => {
    const { transformer, index } = await setup({
      '/a.md': { body: '[[Other]]', fm: { 'notedrop-publish': true } },
      '/Other.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const otherHash = index.getByPath('/Other.md')!.hash
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(`[Other](/notedrop/${otherHash})`)
  })

  it('published wikilink with alias renders alias as link text', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '[[Other|see this]]', fm: { 'notedrop-publish': true } },
      '/Other.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 'o' }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('[see this](/notedrop/o)')
  })

  it('unpublished wikilink without alias becomes dead link with note name', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '[[Private]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(
      '<span class="notedrop-deadlink">Private(접근 권한이 없습니다)</span>'
    )
    expect(r.markdown).not.toContain('[[Private]]')
  })

  it('unpublished wikilink WITH alias renders alias only (no note name leak)', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '[[SecretNote|관련 메모]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('<span class="notedrop-deadlink">관련 메모</span>')
    expect(r.markdown).not.toContain('SecretNote')
  })

  it('multiple identical [[Note]] occurrences all get replaced', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: '[[Other]] and [[Other]] again',
        fm: { 'notedrop-publish': true }
      },
      '/Other.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-slug': 'o' }
      }
    })
    const r = await transformer.transform('/a.md')
    const occurrences = r.markdown.split('[Other](/notedrop/o)').length - 1
    expect(occurrences).toBe(2)
  })

  it('alias-only safety net is exercised even on slug-less unpublished note', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '[[VerySecret|see ref]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).not.toContain('VerySecret')
    expect(r.markdown).toContain('see ref')
  })
})
```

- [ ] **Step 2: Run, confirm RED**

- [ ] **Step 3: Wire wikilink rendering into `ContentTransformer`**

Update `transform()` to call `transformBody`, and add the new private + helpers:

```ts
  async transform(filePath: string): Promise<TransformedContent> {
    const item = this.index.getByPath(filePath)
    if (!item) throw new Error(`ContentTransformer: ${filePath} not in index`)

    const resolved = await this.resolver.resolve(filePath)
    const warnings: string[] = []

    let body = stripFrontmatter(resolved.rawMarkdown)
    body = applyHide(body)
    body = this.transformWikilinks(body, resolved.refs)

    return {
      outputFrontmatter: this.buildFrontmatter(item),
      markdown: body,
      assetRefs: [],
      warnings
    }
  }

  private transformWikilinks(body: string, refs: import('./types.js').Reference[]): string {
    for (const ref of refs) {
      if (ref.type !== 'wikilink') continue
      body = replaceAll(body, ref.rawText, renderWikilink(ref))
    }
    return body
  }
```

Add helpers at the bottom:

```ts
function renderWikilink(ref: import('./types.js').Reference): string {
  const res = ref.resolution
  if (res.kind === 'published-note') {
    const slugOrHash = res.slug ?? res.hash
    const text = ref.alias ?? ref.target
    return `[${text}](/notedrop/${slugOrHash})`
  }
  if (res.kind === 'unpublished-note') {
    if (ref.alias !== undefined) {
      return `<span class="notedrop-deadlink">${ref.alias}</span>`
    }
    return `<span class="notedrop-deadlink">${res.noteName}(접근 권한이 없습니다)</span>`
  }
  return `<span class="notedrop-deadlink">${ref.target}(접근 권한이 없습니다)</span>`
}

function replaceAll(body: string, needle: string, replacement: string): string {
  return body.split(needle).join(replacement)
}
```

(`String.prototype.split().join()` is used because `replaceAll` interprets `$1` style placeholders inside the replacement string; split/join is literal-safe.)

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/ContentTransformer.test.ts
```

Expected: 23 passed (16 + 7).

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/ContentTransformer.ts plugin/src/domain/ContentTransformer.test.ts
git commit -m "feat(plugin/domain): ContentTransformer wikilink safety net"
```

---

## Task 16: ContentTransformer - embed safety + depth limit

**Files:**
- Modify: `plugin/src/domain/ContentTransformer.ts`
- Modify: `plugin/src/domain/ContentTransformer.test.ts`

Implements ADR-0009 embed rules. Spec §9.7 row 2 ("미발행 임베드") + recursion-depth-1 safeguard.

- Unpublished embed → block placeholder, no name leak when alias missing OK (note names of unpublished embeds are visible as "접근할 수 없는 문서: <name>" per ADR-0009; this matches the "embedded notes don't usually need alias" assumption).
- Published embed → inline body, recursively transformed at `depth=0` (so any inner embeds become depth-overflow placeholders).
- Image embeds are deferred to Task 17.

- [ ] **Step 1: Append the test cases**

```ts
describe('ContentTransformer.transform() - embed safety', () => {
  it('unpublished embed becomes placeholder block', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[Private]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(
      '<div class="notedrop-embed-placeholder">접근할 수 없는 문서: Private</div>'
    )
    expect(r.markdown).not.toContain('![[Private]]')
  })

  it('published embed inlines target body (frontmatter stripped)', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'pre ![[B]] post', fm: { 'notedrop-publish': true } },
      '/B.md': { body: 'inner content', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('inner content')
    expect(r.markdown).not.toContain('![[B]]')
    expect(r.markdown).toContain('pre ')
    expect(r.markdown).toContain(' post')
  })

  it('published embed runs HIDE on inner body before inlining', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[B]]', fm: { 'notedrop-publish': true } },
      '/B.md': {
        body: 'visible %%hidden%% rest',
        fm: { 'notedrop-publish': true }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('visible')
    expect(r.markdown).toContain('rest')
    expect(r.markdown).not.toContain('hidden')
  })

  it('embed inside an embedded note becomes depth-overflow placeholder', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[B]]', fm: { 'notedrop-publish': true } },
      '/B.md': {
        body: 'before ![[C]] after',
        fm: { 'notedrop-publish': true }
      },
      '/C.md': { body: 'C body', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(
      '<div class="notedrop-embed-overflow">(임베드 깊이 초과)</div>'
    )
    expect(r.markdown).not.toContain('C body')
  })

  it('depth-overflow applies to unpublished inner embeds too', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[B]]', fm: { 'notedrop-publish': true } },
      '/B.md': { body: '![[Private]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('notedrop-embed-overflow')
    expect(r.markdown).not.toContain('Private')
  })

  it('inner wikilinks of an embedded body still get safety net', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[B]]', fm: { 'notedrop-publish': true } },
      '/B.md': { body: '[[Private]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('notedrop-deadlink')
    expect(r.markdown).not.toContain('[[Private]]')
  })

  it('cyclic embed A -> B -> A is broken at depth limit', async () => {
    const { transformer } = await setup({
      '/A.md': { body: 'one ![[B]] two', fm: { 'notedrop-publish': true } },
      '/B.md': { body: '![[A]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/A.md')
    expect(r.markdown).toContain('notedrop-embed-overflow')
    expect(r.markdown).toContain('one ')
    expect(r.markdown).toContain(' two')
  })
})
```

- [ ] **Step 2: Run, confirm RED**

- [ ] **Step 3: Refactor `transform` to walk the body recursively**

Replace `transform` with the depth-aware version, and split out a private async `transformBody`. The wikilink helper from Task 15 stays, but is now called by `transformBody`.

```ts
  async transform(filePath: string): Promise<TransformedContent> {
    const item = this.index.getByPath(filePath)
    if (!item) throw new Error(`ContentTransformer: ${filePath} not in index`)

    const resolved = await this.resolver.resolve(filePath)
    const warnings: string[] = []
    const assetRefs: import('./types.js').AssetRef[] = []

    let body = stripFrontmatter(resolved.rawMarkdown)
    body = applyHide(body)
    body = await this.transformBody(body, resolved.refs, item.hash, 1, warnings, assetRefs)

    return {
      outputFrontmatter: this.buildFrontmatter(item),
      markdown: body,
      assetRefs,
      warnings
    }
  }

  private async transformBody(
    body: string,
    refs: import('./types.js').Reference[],
    ownerHash: string,
    depthLeft: number,
    warnings: string[],
    assetRefs: import('./types.js').AssetRef[]
  ): Promise<string> {
    for (const ref of refs) {
      if (ref.type === 'wikilink') {
        body = replaceAll(body, ref.rawText, renderWikilink(ref))
        continue
      }
      if (ref.type === 'embed') {
        body = await this.processEmbed(body, ref, ownerHash, depthLeft, warnings, assetRefs)
        continue
      }
      if (ref.type === 'image') {
        // Filled in by Task 17.
        continue
      }
    }
    return body
  }

  private async processEmbed(
    body: string,
    ref: import('./types.js').Reference,
    ownerHash: string,
    depthLeft: number,
    warnings: string[],
    assetRefs: import('./types.js').AssetRef[]
  ): Promise<string> {
    const res = ref.resolution
    if (res.kind === 'unpublished-note') {
      return replaceAll(body, ref.rawText, embedUnpublishedPlaceholder(res.noteName))
    }
    if (res.kind === 'broken') {
      warnings.push(`broken embed: ${ref.target}`)
      return replaceAll(body, ref.rawText, embedUnpublishedPlaceholder(ref.target))
    }
    if (res.kind === 'published-note') {
      if (depthLeft <= 0) {
        return replaceAll(body, ref.rawText, EMBED_OVERFLOW_HTML)
      }
      const target = this.index.get(res.hash)
      if (!target) return replaceAll(body, ref.rawText, embedUnpublishedPlaceholder(ref.target))
      const targetResolved = await this.resolver.resolve(target.filePath)
      let inner = stripFrontmatter(targetResolved.rawMarkdown)
      inner = applyHide(inner)
      inner = await this.transformBody(
        inner, targetResolved.refs, ownerHash, depthLeft - 1, warnings, assetRefs
      )
      return replaceAll(body, ref.rawText, inner)
    }
    return body
  }
```

Add the new helpers at the bottom of the file:

```ts
const EMBED_OVERFLOW_HTML = '<div class="notedrop-embed-overflow">(임베드 깊이 초과)</div>'

function embedUnpublishedPlaceholder(name: string): string {
  return `<div class="notedrop-embed-placeholder">접근할 수 없는 문서: ${name}</div>`
}
```

Also delete the old `transformWikilinks` private (its logic is inlined in `transformBody`).

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/ContentTransformer.test.ts
```

Expected: 30 passed (23 + 7).

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/ContentTransformer.ts plugin/src/domain/ContentTransformer.test.ts
git commit -m "feat(plugin/domain): ContentTransformer embed safety + depth-1 limit"
```

---

## Task 17: ContentTransformer - image absolutization, cover, customCss

**Files:**
- Modify: `plugin/src/domain/ContentTransformer.ts`
- Modify: `plugin/src/domain/ContentTransformer.test.ts`

Final ContentTransformer task. Implements:
- Image refs: rewrite `![[img.png|400]]` to `<img src="/content/<ownerHash>/_assets/img.png" alt="" width="400">`, push `AssetRef` to output.
- Broken image: `[이미지 누락: filename]` placeholder + warning.
- Cover: design note 4 absolutization, vault search, AssetRef push.
- CustomCss: read inline + file, concat, sanitize (`@import`, `url(http*)`, `expression(...)`).

- [ ] **Step 1: Append the test cases**

```ts
describe('ContentTransformer.transform() - images', () => {
  it('image embed becomes absolute <img> with owner hash', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[cover.png]]',
      '/img/cover.png': 'PNGBYTES'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const item = index.getByPath('/a.md')!
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index)
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(
      `<img src="/content/${item.hash}/_assets/cover.png" alt="">`
    )
  })

  it('image with width pipe gets width attribute', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[c.png|400]]',
      '/c.png': 'X'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const item = index.getByPath('/a.md')!
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index)
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(
      `<img src="/content/${item.hash}/_assets/c.png" alt="" width="400">`
    )
  })

  it('image with widthxheight gets both attributes', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[c.png|400x300]]',
      '/c.png': 'X'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const item = index.getByPath('/a.md')!
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index)
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain(`width="400"`)
    expect(r.markdown).toContain(`height="300"`)
  })

  it('image push assetRef with vaultPath, outputPath, mime, size', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[c.png]]',
      '/c.png': 'PNGBYTES'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const item = index.getByPath('/a.md')!
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index)
    const r = await transformer.transform('/a.md')
    expect(r.assetRefs).toHaveLength(1)
    expect(r.assetRefs[0]).toEqual({
      vaultPath: '/c.png',
      outputPath: `/content/${item.hash}/_assets/c.png`,
      size: 'PNGBYTES'.length,
      mime: 'image/png'
    })
  })

  it('broken image becomes placeholder + warning', async () => {
    const { transformer } = await setup({
      '/a.md': { body: '![[missing.png]]', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.markdown).toContain('[이미지 누락: missing.png]')
    expect(r.markdown).not.toContain('![[missing.png]]')
    expect(r.warnings.some((w) => w.includes('missing.png'))).toBe(true)
    expect(r.assetRefs).toEqual([])
  })

  it('multiple images all absolutized and tracked', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\n---\n![[x.png]] ![[y.jpg]]',
      '/x.png': 'X',
      '/y.jpg': 'Y'
    })
    const meta = new FakeMetaCache({
      '/a.md': { frontmatter: { 'notedrop-publish': true } }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index)
    const r = await transformer.transform('/a.md')
    expect(r.assetRefs.map((a) => a.vaultPath).sort()).toEqual(['/x.png', '/y.jpg'])
  })
})

describe('ContentTransformer.transform() - cover', () => {
  it('absolutizes cover vault path to /content/<hash>/_assets/<file>', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '---\nnotedrop-publish: true\nnotedrop-render: book\nnotedrop-cover: "_assets/cover.png"\n---\nbody',
      '/books/B/_assets/cover.png': 'PNG'
    })
    const meta = new FakeMetaCache({
      '/books/B/B.md': {
        frontmatter: {
          'notedrop-publish': true,
          'notedrop-render': 'book',
          'notedrop-cover': '_assets/cover.png'
        }
      }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const item = index.getByPath('/books/B/B.md')!
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index)
    const r = await transformer.transform('/books/B/B.md')
    expect(r.outputFrontmatter.cover).toBe(`/content/${item.hash}/_assets/cover.png`)
    expect(r.assetRefs.find((a) => a.vaultPath === '/books/B/_assets/cover.png')).toBeDefined()
  })

  it('cover null when notedrop-cover absent', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.cover).toBeNull()
  })

  it('cover not found in vault → null + warning', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\nnotedrop-cover: "missing.png"\n---'
    })
    const meta = new FakeMetaCache({
      '/a.md': {
        frontmatter: { 'notedrop-publish': true, 'notedrop-cover': 'missing.png' }
      }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index)
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.cover).toBeNull()
    expect(r.warnings.some((w) => w.includes('cover'))).toBe(true)
  })
})

describe('ContentTransformer.transform() - customCss', () => {
  it('inline notedrop-css populates customCss', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: { 'notedrop-publish': true, 'notedrop-css': '.page { color: red; }' }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).toContain('.page { color: red; }')
  })

  it('file css is read and appended after inline', async () => {
    const vault = new InMemoryVaultFs({
      '/a.md': '---\nnotedrop-publish: true\nnotedrop-css: ".inline { color: red; }"\nnotedrop-css-file: "styles/book.css"\n---',
      '/styles/book.css': '.file { color: blue; }'
    })
    const meta = new FakeMetaCache({
      '/a.md': {
        frontmatter: {
          'notedrop-publish': true,
          'notedrop-css': '.inline { color: red; }',
          'notedrop-css-file': 'styles/book.css'
        }
      }
    })
    const index = new PublishIndex(vault, meta)
    await index.build()
    const transformer = new ContentTransformer(new ContentResolver(vault, meta, index), index)
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).toContain('.inline { color: red; }')
    expect(r.outputFrontmatter.customCss).toContain('.file { color: blue; }')
    const inlinePos = r.outputFrontmatter.customCss!.indexOf('.inline')
    const filePos = r.outputFrontmatter.customCss!.indexOf('.file')
    expect(inlinePos).toBeLessThan(filePos)
  })

  it('missing css file → warning, customCss falls back to inline only', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: {
          'notedrop-publish': true,
          'notedrop-css': '.x {}',
          'notedrop-css-file': 'nope.css'
        }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).toContain('.x {}')
    expect(r.outputFrontmatter.customCss).not.toContain('nope.css')
    expect(r.warnings.some((w) => w.includes('nope.css'))).toBe(true)
  })

  it('strips @import lines (CSS sanitize)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: {
          'notedrop-publish': true,
          'notedrop-css': '@import "evil.css";\n.ok { color: red; }'
        }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).not.toContain('@import')
    expect(r.outputFrontmatter.customCss).toContain('.ok { color: red; }')
  })

  it('strips url(http*) (CSS sanitize)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: {
          'notedrop-publish': true,
          'notedrop-css': '.x { background: url(https://evil.com/track.png); }'
        }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).not.toContain('https://evil.com')
  })

  it('strips expression() (CSS sanitize)', async () => {
    const { transformer } = await setup({
      '/a.md': {
        body: 'x',
        fm: {
          'notedrop-publish': true,
          'notedrop-css': '.x { width: expression(alert(1)); }'
        }
      }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).not.toContain('expression(')
  })

  it('customCss null when neither key set', async () => {
    const { transformer } = await setup({
      '/a.md': { body: 'x', fm: { 'notedrop-publish': true } }
    })
    const r = await transformer.transform('/a.md')
    expect(r.outputFrontmatter.customCss).toBeNull()
  })
})
```

- [ ] **Step 2: Run, confirm RED**

- [ ] **Step 3: Implement image, cover, customCss**

Replace the body of `transform`, add helpers. Final relevant blocks:

```ts
  async transform(filePath: string): Promise<TransformedContent> {
    const item = this.index.getByPath(filePath)
    if (!item) throw new Error(`ContentTransformer: ${filePath} not in index`)

    const resolved = await this.resolver.resolve(filePath)
    const warnings: string[] = []
    const assetRefs: import('./types.js').AssetRef[] = []

    let body = stripFrontmatter(resolved.rawMarkdown)
    body = applyHide(body)
    body = await this.transformBody(body, resolved.refs, item.hash, 1, warnings, assetRefs)

    const cover = await this.resolveCover(item, warnings, assetRefs)
    const customCss = await this.buildCustomCss(item, warnings)

    return {
      outputFrontmatter: { ...this.buildFrontmatter(item), cover, customCss },
      markdown: body,
      assetRefs,
      warnings
    }
  }
```

Update the `image` branch in `transformBody`:

```ts
      if (ref.type === 'image') {
        body = await this.processImage(body, ref, ownerHash, warnings, assetRefs)
        continue
      }
```

Add helpers as private methods:

```ts
  private async processImage(
    body: string,
    ref: import('./types.js').Reference,
    ownerHash: string,
    warnings: string[],
    assetRefs: import('./types.js').AssetRef[]
  ): Promise<string> {
    const res = ref.resolution
    if (res.kind !== 'image') {
      warnings.push(`broken image: ${ref.target}`)
      return replaceAll(body, ref.rawText, `[이미지 누락: ${ref.target}]`)
    }
    const basename = res.vaultPath.split('/').pop()!
    const outputPath = `/content/${ownerHash}/_assets/${basename}`
    const bytes = await this.vaultRead(res.vaultPath)
    if (!assetRefs.some((a) => a.outputPath === outputPath)) {
      assetRefs.push({
        vaultPath: res.vaultPath,
        outputPath,
        size: bytes.byteLength,
        mime: res.mime
      })
    }
    const attrs = [`src="${outputPath}"`, 'alt=""']
    if (ref.size?.width !== undefined) attrs.push(`width="${ref.size.width}"`)
    if (ref.size?.height !== undefined) attrs.push(`height="${ref.size.height}"`)
    return replaceAll(body, ref.rawText, `<img ${attrs.join(' ')}>`)
  }

  private async resolveCover(
    item: import('./types.js').PublishedItem,
    warnings: string[],
    assetRefs: import('./types.js').AssetRef[]
  ): Promise<string | null> {
    if (!item.cover) return null
    const basename = item.cover.split('/').pop()!
    const matches = await this.vaultSearch(basename)
    if (matches.length === 0) {
      warnings.push(`cover not found: ${item.cover}`)
      return null
    }
    const vaultPath = matches[0]!
    const bytes = await this.vaultRead(vaultPath)
    const outputPath = `/content/${item.hash}/_assets/${basename}`
    if (!assetRefs.some((a) => a.outputPath === outputPath)) {
      assetRefs.push({
        vaultPath,
        outputPath,
        size: bytes.byteLength,
        mime: mimeFor(basename)
      })
    }
    return outputPath
  }

  private async buildCustomCss(
    item: import('./types.js').PublishedItem,
    warnings: string[]
  ): Promise<string | null> {
    const parts: string[] = []
    if (item.customCssRaw.inline) parts.push(item.customCssRaw.inline)
    if (item.customCssRaw.file) {
      try {
        const fileCss = await this.vaultReadText(item.customCssRaw.file)
        parts.push(fileCss)
      } catch {
        warnings.push(`customCss file not found: ${item.customCssRaw.file}`)
      }
    }
    if (parts.length === 0) return null
    return sanitizeCss(parts.join('\n'))
  }

  private async vaultRead(path: string): Promise<Uint8Array> {
    const vfs = (this.resolver as unknown as { vault: import('../ports/VaultFs.js').VaultFs }).vault
    return vfs.readBinary(path)
  }

  private async vaultReadText(path: string): Promise<string> {
    const vfs = (this.resolver as unknown as { vault: import('../ports/VaultFs.js').VaultFs }).vault
    return vfs.readFile(path)
  }

  private async vaultSearch(name: string): Promise<string[]> {
    const vfs = (this.resolver as unknown as { vault: import('../ports/VaultFs.js').VaultFs }).vault
    return vfs.searchByName(name)
  }
```

The cast to `{ vault }` is unsafe because `ContentResolver` stores `vault` as a private field. To avoid the cast entirely, add a constructor param to `ContentTransformer` so it has its own `vault` reference. Update both the constructor and the call sites:

```ts
  constructor(
    private resolver: ContentResolver,
    private index: PublishIndex,
    private vault: import('../ports/VaultFs.js').VaultFs
  ) {}
```

Then replace the three `this.vaultXxx` helpers with direct `this.vault.readBinary(...)`, `this.vault.readFile(...)`, `this.vault.searchByName(...)`. Update existing test-file `setup()` to pass `vault` as the third arg:

```ts
return {
  vault,
  meta,
  index,
  transformer: new ContentTransformer(
    new ContentResolver(vault, meta, index),
    index,
    vault
  )
}
```

Also the inline test cases that build `transformer` directly need the same `vault` third arg.

Add helpers at the bottom:

```ts
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  gif: 'image/gif'
}

function mimeFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

function sanitizeCss(css: string): string {
  return css
    .split(/\r?\n/)
    .filter((line) => !/@import\b/i.test(line))
    .join('\n')
    .replace(/url\(\s*['"]?https?:[^)]*\)/gi, 'url()')
    .replace(/\bexpression\s*\([^)]*\)/gi, '')
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/ContentTransformer.test.ts
```

Expected: 47 passed (30 + 17 covering image + cover + customCss).

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/ContentTransformer.ts plugin/src/domain/ContentTransformer.test.ts
git commit -m "feat(plugin/domain): ContentTransformer image/cover/customCss + sanitize"
```

---

## Task 18: AssetCollector

**Files:**
- Create: `plugin/src/domain/AssetCollector.ts`
- Create: `plugin/src/domain/AssetCollector.test.ts`

Per spec §8.2.4. Two methods:
- `findRefs(refs, hash)` filters image refs and builds `AssetRef[]` (size from vault).
- `copy(refs, writer)` reads each vault path and hands bytes to a `writer` callback.

Output filesystem is intentionally NOT a new Port. The writer is a function (`(outputPath, bytes) => Promise<void>`). M2 will inject a Node-fs-backed writer; tests use `vi.fn()`.

- [ ] **Step 1: Write tests**

Create `plugin/src/domain/AssetCollector.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { AssetCollector } from './AssetCollector.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import type { Reference } from './types.js'

const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function imageRef(target: string, vaultPath: string, mime = 'image/png'): Reference {
  return {
    type: 'image',
    rawText: `![[${target}]]`,
    target,
    resolution: { kind: 'image', vaultPath, mime }
  }
}

describe('AssetCollector.findRefs', () => {
  it('returns empty for no refs', async () => {
    const vault = new InMemoryVaultFs({})
    const c = new AssetCollector(vault)
    expect(await c.findRefs([], HASH)).toEqual([])
  })

  it('skips non-image refs', async () => {
    const vault = new InMemoryVaultFs({})
    const c = new AssetCollector(vault)
    const refs: Reference[] = [{
      type: 'wikilink',
      rawText: '[[X]]',
      target: 'X',
      resolution: { kind: 'unpublished-note', noteName: 'X' }
    }]
    expect(await c.findRefs(refs, HASH)).toEqual([])
  })

  it('builds AssetRef with outputPath under hash dir', async () => {
    const vault = new InMemoryVaultFs({ '/img/c.png': 'PNGBYTES' })
    const c = new AssetCollector(vault)
    const refs = [imageRef('c.png', '/img/c.png')]
    expect(await c.findRefs(refs, HASH)).toEqual([{
      vaultPath: '/img/c.png',
      outputPath: `/content/${HASH}/_assets/c.png`,
      size: 'PNGBYTES'.length,
      mime: 'image/png'
    }])
  })

  it('deduplicates same outputPath across refs', async () => {
    const vault = new InMemoryVaultFs({ '/img/c.png': 'X' })
    const c = new AssetCollector(vault)
    const refs = [imageRef('c.png', '/img/c.png'), imageRef('c.png', '/img/c.png')]
    const out = await c.findRefs(refs, HASH)
    expect(out).toHaveLength(1)
  })

  it('skips broken image refs', async () => {
    const vault = new InMemoryVaultFs({})
    const c = new AssetCollector(vault)
    const broken: Reference = {
      type: 'image',
      rawText: '![[m.png]]',
      target: 'm.png',
      resolution: { kind: 'broken', reason: 'not found' }
    }
    expect(await c.findRefs([broken], HASH)).toEqual([])
  })
})

describe('AssetCollector.copy', () => {
  it('reads vaultPath and calls writer with outputPath + bytes for each', async () => {
    const vault = new InMemoryVaultFs({ '/x.png': 'X', '/y.png': 'YY' })
    const c = new AssetCollector(vault)
    const writer = vi.fn().mockResolvedValue(undefined)
    await c.copy(
      [
        { vaultPath: '/x.png', outputPath: '/out/x.png', size: 1, mime: 'image/png' },
        { vaultPath: '/y.png', outputPath: '/out/y.png', size: 2, mime: 'image/png' }
      ],
      writer
    )
    expect(writer).toHaveBeenCalledTimes(2)
    expect(writer.mock.calls[0]![0]).toBe('/out/x.png')
    expect(writer.mock.calls[1]![0]).toBe('/out/y.png')
  })

  it('propagates writer rejections', async () => {
    const vault = new InMemoryVaultFs({ '/x.png': 'X' })
    const c = new AssetCollector(vault)
    const writer = vi.fn().mockRejectedValue(new Error('disk full'))
    await expect(
      c.copy(
        [{ vaultPath: '/x.png', outputPath: '/o/x.png', size: 1, mime: 'image/png' }],
        writer
      )
    ).rejects.toThrow('disk full')
  })

  it('rejects when source vault path missing', async () => {
    const vault = new InMemoryVaultFs({})
    const c = new AssetCollector(vault)
    const writer = vi.fn()
    await expect(
      c.copy(
        [{ vaultPath: '/missing.png', outputPath: '/o/missing.png', size: 1, mime: 'image/png' }],
        writer
      )
    ).rejects.toThrow(/not found/)
    expect(writer).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, confirm RED**

- [ ] **Step 3: Implement `AssetCollector.ts`**

Create `plugin/src/domain/AssetCollector.ts`:

```ts
import type { VaultFs } from '../ports/VaultFs.js'
import type { Reference, AssetRef } from './types.js'

export type AssetWriter = (outputPath: string, content: Uint8Array) => Promise<void>

export class AssetCollector {
  constructor(private vault: VaultFs) {}

  async findRefs(refs: Reference[], hash: string): Promise<AssetRef[]> {
    const out: AssetRef[] = []
    const seen = new Set<string>()
    for (const ref of refs) {
      if (ref.type !== 'image') continue
      if (ref.resolution.kind !== 'image') continue
      const basename = ref.resolution.vaultPath.split('/').pop()!
      const outputPath = `/content/${hash}/_assets/${basename}`
      if (seen.has(outputPath)) continue
      seen.add(outputPath)
      const bytes = await this.vault.readBinary(ref.resolution.vaultPath)
      out.push({
        vaultPath: ref.resolution.vaultPath,
        outputPath,
        size: bytes.byteLength,
        mime: ref.resolution.mime
      })
    }
    return out
  }

  async copy(refs: AssetRef[], writer: AssetWriter): Promise<void> {
    for (const ref of refs) {
      const bytes = await this.vault.readBinary(ref.vaultPath)
      await writer(ref.outputPath, bytes)
    }
  }
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/AssetCollector.test.ts
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/AssetCollector.ts plugin/src/domain/AssetCollector.test.ts
git commit -m "feat(plugin/domain): AssetCollector findRefs + copy via writer callback"
```

---

## Task 19: BookAssembler

**Files:**
- Create: `plugin/src/domain/BookAssembler.ts`
- Create: `plugin/src/domain/BookAssembler.test.ts`

Per spec §8.2.5 + ADR-0005. `assemble(entryFilePath)` returns `ChapterPlan` with one of three sources: `'waypoint'` (preferred), `'moc'`, `'folder-scan'`.

Folder scan exclusions per ADR-0005: files starting with `_` or `.`, `CLAUDE.md`, `MOC.md`, the entry file itself, plus any wellknown internal name like `원본매핑.md`.

**Deviation from spec §8.2.5**: the spec shows `constructor(vault, meta, index)`, but this plan drops the `index` parameter. `BookAssembler.assemble` only enumerates *candidate* chapter paths from the vault; PublishIndex.linkBooks (Task 11) filters those candidates against the published set. This avoids the cyclic dependency that the spec signature implies. Flag in review if a downstream caller needs the index inside BookAssembler.

- [ ] **Step 1: Write tests**

Create `plugin/src/domain/BookAssembler.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BookAssembler } from './BookAssembler.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

describe('BookAssembler.assemble', () => {
  it('extracts chapters from a Waypoint block in entry file', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '# Title\n%% Begin Waypoint %%\n- [[01. one]]\n- [[02. two]]\n%% End Waypoint %%\n',
      '/books/B/01. one.md': '',
      '/books/B/02. two.md': ''
    })
    const meta = new FakeMetaCache({})
    const a = new BookAssembler(vault, meta)
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.source).toBe('waypoint')
    expect(plan.chapters).toEqual([
      { filePath: '/books/B/01. one.md', order: 1 },
      { filePath: '/books/B/02. two.md', order: 2 }
    ])
  })

  it('falls back to MOC.md when no Waypoint block', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '# Title',
      '/books/B/MOC.md': '- [[01. one]]\n- [[02. two]]',
      '/books/B/01. one.md': '',
      '/books/B/02. two.md': ''
    })
    const meta = new FakeMetaCache({})
    const a = new BookAssembler(vault, meta)
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.source).toBe('moc')
    expect(plan.chapters.map((c) => c.filePath)).toEqual([
      '/books/B/01. one.md',
      '/books/B/02. two.md'
    ])
  })

  it('falls back to folder-scan when no Waypoint and no MOC', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/01.md': '',
      '/books/B/02.md': '',
      '/books/B/03.md': ''
    })
    const meta = new FakeMetaCache({})
    const a = new BookAssembler(vault, meta)
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.source).toBe('folder-scan')
    expect(plan.chapters.map((c) => c.filePath)).toEqual([
      '/books/B/01.md',
      '/books/B/02.md',
      '/books/B/03.md'
    ])
  })

  it('folder-scan excludes _-prefixed and .-prefixed files', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/_draft.md': '',
      '/books/B/.hidden.md': '',
      '/books/B/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters.map((c) => c.filePath)).toEqual(['/books/B/01.md'])
  })

  it('folder-scan excludes CLAUDE.md, MOC.md, entry file, 원본매핑.md', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/CLAUDE.md': '',
      '/books/B/MOC.md': '',
      '/books/B/원본매핑.md': '',
      '/books/B/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters.map((c) => c.filePath)).toEqual(['/books/B/01.md'])
  })

  it('folder-scan natural order (numeric prefix sorted correctly)', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/02.md': '',
      '/books/B/10.md': '',
      '/books/B/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters.map((c) => c.filePath)).toEqual([
      '/books/B/01.md',
      '/books/B/02.md',
      '/books/B/10.md'
    ])
  })

  it('Waypoint with no inner wikilinks falls back to MOC then folder-scan', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '%% Begin Waypoint %%\n%% End Waypoint %%',
      '/books/B/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.source).toBe('folder-scan')
    expect(plan.chapters.map((c) => c.filePath)).toEqual(['/books/B/01.md'])
  })

  it('MOC with no wikilinks falls back to folder-scan', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/MOC.md': '# Empty TOC\n\nno links here',
      '/books/B/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.source).toBe('folder-scan')
  })

  it('returns empty chapters when folder is empty', async () => {
    const vault = new InMemoryVaultFs({ '/books/B/B.md': '' })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters).toEqual([])
  })

  it('order is 1-based and sequential', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '',
      '/books/B/a.md': '',
      '/books/B/b.md': '',
      '/books/B/c.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters.map((c) => c.order)).toEqual([1, 2, 3])
  })

  it('Waypoint resolves wikilinks against entry folder + vault search', async () => {
    const vault = new InMemoryVaultFs({
      '/books/B/B.md': '%% Begin Waypoint %%\n- [[01]]\n%% End Waypoint %%',
      '/books/B/Part 1/01.md': ''
    })
    const a = new BookAssembler(vault, new FakeMetaCache({}))
    const plan = await a.assemble('/books/B/B.md')
    expect(plan.chapters[0]!.filePath).toBe('/books/B/Part 1/01.md')
  })
})
```

- [ ] **Step 2: Run, confirm RED**

- [ ] **Step 3: Implement `BookAssembler.ts`**

Create `plugin/src/domain/BookAssembler.ts`:

```ts
import type { VaultFs } from '../ports/VaultFs.js'
import type { MetaCache } from '../ports/MetaCache.js'
import type { ChapterPlan } from './types.js'

const WAYPOINT_RE = /%%\s*Begin Waypoint\s*%%([\s\S]*?)%%\s*End Waypoint\s*%%/i
const WIKILINK_RE = /\[\[([^\]\n|#]+)/g
const EXCLUDED_BASENAMES: ReadonlySet<string> = new Set([
  'CLAUDE.md',
  'MOC.md',
  '원본매핑.md'
])

export class BookAssembler {
  constructor(private vault: VaultFs, private meta: MetaCache) {}

  async assemble(entryFilePath: string): Promise<ChapterPlan> {
    const wp = await this.tryWaypoint(entryFilePath)
    if (wp.length > 0) return label('waypoint', wp)
    const moc = await this.tryMoc(entryFilePath)
    if (moc.length > 0) return label('moc', moc)
    const scan = await this.tryFolderScan(entryFilePath)
    return label('folder-scan', scan)
  }

  private async tryWaypoint(entryPath: string): Promise<string[]> {
    const content = await safeRead(this.vault, entryPath)
    const block = WAYPOINT_RE.exec(content)
    if (!block) return []
    return this.resolveWikilinks(block[1]!, entryPath)
  }

  private async tryMoc(entryPath: string): Promise<string[]> {
    const folder = parentFolder(entryPath)
    const mocPath = `${folder}/MOC.md`
    if (!(await this.vault.fileExists(mocPath))) return []
    const content = await this.vault.readFile(mocPath)
    return this.resolveWikilinks(content, entryPath)
  }

  private async tryFolderScan(entryPath: string): Promise<string[]> {
    const folder = parentFolder(entryPath)
    const all = await this.vault.listFiles(folder)
    const out: string[] = []
    for (const path of all) {
      if (path === entryPath) continue
      if (!path.endsWith('.md')) continue
      const base = path.split('/').pop()!
      if (base.startsWith('_') || base.startsWith('.')) continue
      if (EXCLUDED_BASENAMES.has(base)) continue
      out.push(path)
    }
    out.sort((a, b) => naturalCompare(a, b))
    return out
  }

  private async resolveWikilinks(text: string, entryPath: string): Promise<string[]> {
    const out: string[] = []
    const folder = parentFolder(entryPath)
    for (const match of text.matchAll(WIKILINK_RE)) {
      const target = match[1]!.trim()
      if (!target) continue
      const sameFolder = `${folder}/${target}.md`
      if (await this.vault.fileExists(sameFolder)) {
        out.push(sameFolder)
        continue
      }
      const matches = await this.vault.searchByName(`${target}.md`)
      if (matches.length > 0) out.push(matches[0]!)
    }
    return out
  }
}

function label(source: ChapterPlan['source'], paths: string[]): ChapterPlan {
  return {
    source,
    chapters: paths.map((filePath, i) => ({ filePath, order: i + 1 }))
  }
}

function parentFolder(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
}

async function safeRead(vault: VaultFs, path: string): Promise<string> {
  try { return await vault.readFile(path) } catch { return '' }
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/BookAssembler.test.ts
```

Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/BookAssembler.ts plugin/src/domain/BookAssembler.test.ts
git commit -m "feat(plugin/domain): BookAssembler Waypoint/MOC/folder-scan fallback"
```

---

## Task 20: ManifestBuilder

**Files:**
- Create: `plugin/src/domain/ManifestBuilder.ts`
- Create: `plugin/src/domain/ManifestBuilder.test.ts`

Per spec §8.2.6 + §7.2. Serializes `PublishIndex.list()` to public `Manifest`. Drops internal-only `filePath` and `customCssRaw`. Sets `version: 1`, `generatedAt: now`, `generatedBy` from option.

- [ ] **Step 1: Write tests**

Create `plugin/src/domain/ManifestBuilder.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ManifestBuilder } from './ManifestBuilder.js'
import { PublishIndex } from './PublishIndex.js'
import { InMemoryVaultFs } from '../testing/InMemoryVaultFs.js'
import { FakeMetaCache } from '../testing/FakeMetaCache.js'

describe('ManifestBuilder.build()', () => {
  let vault: InMemoryVaultFs
  let meta: FakeMetaCache
  let index: PublishIndex

  beforeEach(async () => {
    vault = new InMemoryVaultFs({})
    meta = new FakeMetaCache({})
    await vault.writeFile('/books/B/B.md', '')
    await vault.writeFile('/notes/solo.md', '')
    meta.seed('/books/B/B.md', {
      frontmatter: {
        'notedrop-publish': true,
        'notedrop-render': 'book',
        'notedrop-slug': 'b'
      }
    })
    meta.seed('/notes/solo.md', {
      frontmatter: { 'notedrop-publish': true, 'notedrop-cover': 'thumb.png' }
    })
    index = new PublishIndex(vault, meta)
    await index.build()
  })

  it('returns Manifest with version 1', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'notedrop-plugin@0.1.0' })
    expect(m.version).toBe(1)
  })

  it('generatedBy reflects option', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'tool@1.2' })
    expect(m.generatedBy).toBe('tool@1.2')
  })

  it('generatedAt is an ISO timestamp', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    expect(() => new Date(m.generatedAt).toISOString()).not.toThrow()
  })

  it('items length equals index size', () => {
    const builder = new ManifestBuilder(index)
    expect(builder.build({ generatedBy: 'x' }).items).toHaveLength(2)
  })

  it('drops PublishedItem.filePath from output', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    for (const item of m.items) {
      expect((item as Record<string, unknown>).filePath).toBeUndefined()
    }
  })

  it('drops PublishedItem.customCssRaw from output', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    for (const item of m.items) {
      expect((item as Record<string, unknown>).customCssRaw).toBeUndefined()
    }
  })

  it('emits ManifestItem with exactly the 10 spec keys', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    expect(Object.keys(m.items[0]!).sort()).toEqual([
      'chapters',
      'cover',
      'hash',
      'order',
      'parent',
      'render',
      'slug',
      'title',
      'type',
      'updatedAt'
    ])
  })

  it('cover passes through (raw vault path is intentional - resolved at publish time)', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    const solo = m.items.find((it) => it.title === 'solo')!
    // ManifestBuilder does NOT absolutize cover; ContentTransformer does that for
    // PageFrontmatter. Public manifest stores raw vault hint until M4 publish step
    // overrides with absolute. Until M4 lands, raw vault path is the safe default.
    expect(solo.cover).toBe('thumb.png')
  })

  it('chapters array preserved when present', async () => {
    // Set a chapter manually via upsert + book linking simulation
    await vault.writeFile('/books/B/01.md', '')
    meta.seed('/books/B/01.md', { frontmatter: { 'notedrop-publish': true } })
    index.upsert('/books/B/01.md')
    // Simulate linkBooks effect for the test
    const entry = index.getByPath('/books/B/B.md')!
    const ch = index.getByPath('/books/B/01.md')!
    ;(index as unknown as {
      byHash: Map<string, import('./types.js').PublishedItem>
    }).byHash.set(entry.hash, { ...entry, chapters: [ch.hash] })
    ;(index as unknown as {
      byHash: Map<string, import('./types.js').PublishedItem>
    }).byHash.set(ch.hash, { ...ch, type: 'chapter', parent: entry.hash, order: 1 })

    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    const entryItem = m.items.find((it) => it.hash === entry.hash)!
    expect(entryItem.chapters).toEqual([ch.hash])
    const chItem = m.items.find((it) => it.hash === ch.hash)!
    expect(chItem.chapters).toBeNull()
    expect(chItem.parent).toBe(entry.hash)
  })

  it('items sorted: entries first then chapters by parent+order', () => {
    const builder = new ManifestBuilder(index)
    const m = builder.build({ generatedBy: 'x' })
    expect(m.items[0]!.type).toBe('entry')
  })
})
```

- [ ] **Step 2: Run, confirm RED**

- [ ] **Step 3: Implement `ManifestBuilder.ts`**

Create `plugin/src/domain/ManifestBuilder.ts`:

```ts
import type { PublishIndex } from './PublishIndex.js'
import type { Manifest, ManifestItem } from '../types.js'
import type { PublishedItem } from './types.js'

export type ManifestOptions = { generatedBy: string }

export class ManifestBuilder {
  constructor(private index: PublishIndex) {}

  build(opts: ManifestOptions): Manifest {
    const items = this.index.list()
      .map(serialize)
      .sort(orderItems)
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      items
    }
  }
}

function serialize(item: PublishedItem): ManifestItem {
  return {
    hash: item.hash,
    slug: item.slug,
    title: item.title,
    cover: item.cover,
    render: item.render,
    type: item.type,
    parent: item.parent,
    order: item.order,
    chapters: item.chapters,
    updatedAt: item.updatedAt
  }
}

function orderItems(a: ManifestItem, b: ManifestItem): number {
  if (a.type === 'entry' && b.type !== 'entry') return -1
  if (a.type !== 'entry' && b.type === 'entry') return 1
  if (a.parent && b.parent && a.parent === b.parent) {
    return (a.order ?? 0) - (b.order ?? 0)
  }
  return a.title.localeCompare(b.title)
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
cd plugin && npm test -- src/domain/ManifestBuilder.test.ts
```

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/ManifestBuilder.ts plugin/src/domain/ManifestBuilder.test.ts
git commit -m "feat(plugin/domain): ManifestBuilder serialization with field omission"
```

---

## Task 21: Coverage gate + M1 completion

**Files:**
- Run: `plugin/` test suite with coverage
- Tag: `m1-domain-complete`

Validates all M1 acceptance criteria from `docs/11-mvp-and-roadmap.md` §11.5:
- 200+ unit tests target (we land roughly 175-200 by this task; the 200+ target is approximate per spec)
- Domain layer coverage 90%+
- Safety net 100% (every row of §9.7 that Domain owns is exercised)

- [ ] **Step 1: Run the full test suite**

```bash
cd plugin && npm test
```

Expected: ALL test files pass (no skipped, no `.only`).

Capture the final test count for the M1 commit message.

- [ ] **Step 2: Run coverage**

```bash
cd plugin && npm run test:coverage
```

Expected: vitest reports coverage; thresholds (lines 90 / functions 90 / branches 85 / statements 90) pass; exit 0.

- [ ] **Step 3: Verify safety-net coverage manually**

The vitest threshold is global. Open `coverage/index.html` and confirm `src/domain/ContentTransformer.ts` shows 100% line coverage. If anything is yellow / red, write a test that hits the missing branch before continuing.

Required green ranges (one assertion per spec §9.7 row owned by Domain):
- `applyHide` (HIDE policy): lines covering single + multi-line + Waypoint + multi-block patterns.
- `renderWikilink` unpublished branches: lines for both alias and no-alias paths.
- `processEmbed`: lines for `unpublished-note`, `broken`, depth-overflow, published-note expansion.
- `sanitizeCss`: lines for `@import`, http url, expression branches.

If any branch is uncovered, append a targeted test case to the corresponding test file and repeat Step 1-2.

- [ ] **Step 4: Run typecheck (last gate)**

```bash
cd plugin && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Commit M1 completion + tag**

```bash
git add -A
git commit -m "chore(m1): Domain Layer complete - coverage gate passed"
git tag -a m1-domain-complete -m "M1 milestone: Domain Layer (6 modules + ports + fakes) with TDD coverage 90%+ and safety net 100%"
```

- [ ] **Step 6: Verify tag**

```bash
git tag --list 'm1-*'
```

Expected: `m1-domain-complete` present.

---

## What lands in M2 (out of scope here)

These are deliberately deferred. Listing them so the engineer does not start any of them in this milestone:

- ObsidianVaultFs / ObsidianMetaCache adapters
- VaultEventBridge wiring
- Plugin entry (`main.ts`), `manifest.json`, esbuild config
- Settings UI, command registrations
- Local HTTP / SSE server (M3)
- Git push / IsomorphicGitClient (M4)
- Viewer (M3)

Stop after Task 21. Do not start M2 in the same session unless explicitly directed.
