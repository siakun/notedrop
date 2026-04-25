---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - arc42
  - runtime
summary: 라이브 미리보기·발행 시퀀스, 변환 파이프라인, 캐시 전략
---
# 06. Runtime View

## 6.1 두 가지 모드 비교

같은 Domain 파이프라인을 두 트리거가 호출. 다른 건 출력처와 변환 시점.

| 측면 | 라이브 미리보기 | 발행 |
|---|---|---|
| 트리거 | "Start preview" 명령어 / 설정 토글 | "Share this note" / 설정 [+ Add] |
| 빈도 | 작업 중 상시 | 명시적 액션 시 1회 |
| 데이터 소스 | vault 라이브 | vault → 변환 → public 레포 (스냅샷) |
| 변환 시점 | 요청 시 lazy | publish 시 eager |
| 변경 감지 | vault 이벤트 → SSE → 브라우저 refetch | 자동 X (작가가 다시 publish) |
| 출력처 | localhost:7777 HTTP 응답 | content/<hash>/index.md 파일 + git push |
| 보존 | 메모리만 | git commit |
| 자산 복사 | 메타만 | 실제 파일 복사 |

## 6.2 라이브 미리보기 시퀀스

```
사용자                    Plugin                              Browser
─────                    ──────                              ───────
"Start preview"
  명령어                  LocalServer.start()
                         PublishIndex 초기 빌드 (1회)
                         → "http://localhost:7777" 클립보드 복사

URL 열기                  GET /                            → 뷰어 SPA HTML/JS 로드 (캐시됨)

                         GET /manifest.json
                         ← ManifestBuilder.build()
                                                          → 페이지 리스트 표시

페이지 클릭               GET /content/aB3xK9
                         ← ContentResolver(file)
                         ← ContentTransformer(...)
                         ← 청정 마크다운 응답 (frontmatter 포함)
                                                          → unified pipeline 파싱
                                                          → paged.js 페이지 분할
                                                          → 책 모드 사이드바 표시

vault 에서 편집 + 저장   Obsidian fires vault.on('modify')
                         → MetadataCache 자동 갱신
                         → VaultEventBridge → PublishIndex 갱신
                         → SSE 푸시: { type: 'changed', hash: 'aB3xK9' }
                                                          ← SSE 수신
                                                          → contentClient 캐시 무효화
                                                          → GET /content/aB3xK9 재요청
                                                          → paged.js 재페이지
                                                            (페이지 위치 유지 시도)

"Stop preview" / 종료   LocalServer.stop()
                         → 인메모리 캐시 GC
```

## 6.3 발행 시퀀스

### 6.3.1 Share

```
사용자                    Plugin                              Public 레포 / GH Pages
─────                    ──────                              ───────────────────
"Share this note"        publish(file):
  명령어                   1. Frontmatter 토글 - notedrop-publish: true
                            (이미 true 면 스킵)
                         2. PublishIndex 갱신
                            (MetadataCache 이벤트로 자동)
                         3. 변환 파이프라인 (eager):
                            - ContentResolver (ref 해석)
                            - ContentTransformer (HIDE/RENDER, 안전장치)
                            - AssetCollector (이미지 vault 에서 찾기)
                            - BookAssembler (book 이면 챕터 순서)
                            - ManifestBuilder (새 manifest)
                         4. GitPublisher.publish(file):
                            - 임시 디렉터리에 결과물 stage
                              (변경된 파일만)
                            - public 레포 clone (없으면) / 디렉터리 사용
                            - content/<hash>/index.md, _assets/ 덮어쓰기
                            - manifest.json 덮어쓰기
                            - git add + commit + push (no pull)
                                                          ← git push 받음
                                                          → GH Actions 트리거
                                                          → 정적 파일 deploy
                                                            (SSG 빌드 X)
                                                          → 1분 이내 live
                         5. URL 클립보드 복사
                         6. Notice("✓ 발행 완료") 표시
```

### 6.3.2 Unshare

```
"Unshare this note"     unpublish(file):
  명령어                   1. Frontmatter 에서 notedrop-publish 제거
                         2. PublishIndex 갱신
                         3. GitPublisher.unpublish(file):
                            - content/<hash>/ 디렉터리 삭제
                            - manifest.json 갱신 (해당 hash 제거,
                              부모 책의 chapters 배열에서도 제거)
                            - git add + commit + push
                         4. Notice("✓ 공유 해제됨") 표시
```

### 6.3.3 vault 파일 삭제 (자동 unpublish)

```
사용자가 vault 파일 삭제 → Obsidian fires vault.on('delete')
                       → VaultEventBridge → PublishIndex.remove(path)
                       
다음 발행 또는 명시적 명령어 "Sync deleted" 시:
                       → 비교: PublishIndex 에 없는데 public 레포에 있는 hash 들 → 삭제 commit
                       
또는 즉시 자동 unpublish (옵션):
                       → 즉시 GitPublisher.unpublish(path)
```

MVP 정책: 즉시 자동 unpublish. 옵션 토글 (기본 ON) 으로 사용자가 끌 수 있음.

## 6.4 변환 파이프라인 흐름

모든 요청 (라이브: HTTP, 발행: 함수 호출) 이 거치는 공통 파이프라인:

```
요청 (filePath)
       ↓
[ContentResolver.resolve(file)]
   - rawMarkdown 읽기
   - frontmatter 파싱
   - 위키링크/임베드/이미지 ref 추출
   - PublishIndex 조회로 각 ref 해석
   - 결과: ResolvedContent { rawMarkdown, frontmatter, refs[] }
       ↓
[ContentTransformer.transform()]
   - frontmatter 정제 (notedrop-* 외 strip, public 출력용 PageFrontmatter 생성)
   - 본문에 HIDE 적용 (%%, Waypoint 블록, frontmatter 자체)
   - 안전장치 적용:
     · 미발행 위키링크 → 빨간 dead link
     · 미발행 임베드 → "접근할 수 없는 문서" placeholder
     · 발행된 임베드 → 인라인 삽입 (재귀 깊이 1 까지)
   - 이미지 경로 절대화 (/content/<hash>/_assets/...)
   - 결과: TransformedContent { outputFrontmatter, markdown, assetRefs, warnings }
       ↓
[AssetCollector]
   - 라이브: findRefs() - 메타만 (요청 응답에 자산 URL 만 포함)
   - 발행:   findRefs() + copy() - 실제 파일 stage
       ↓
[Output]
   - 라이브: HTTP 응답 (frontmatter + markdown 합친 .md 형식)
   - 발행:   임시 디렉터리에 content/<hash>/index.md 저장
       ↓
[발행 모드 추가 단계]
   + [BookAssembler]   - book entry 면 챕터 모음, manifest 의 chapters 배열 갱신
   + [ManifestBuilder] - 카탈로그 업데이트
   + [GitPublisher]    - git add + commit + push
```

## 6.5 캐시 전략

| 위치 | 무엇 | 무효화 |
|---|---|---|
| 플러그인 메모리 | PublishIndex (Map) | vault 이벤트로 incremental update |
| 플러그인 메모리 | 자산 vault 위치 인덱스 | `vault.on('rename' \| 'delete')` |
| 플러그인 메모리 | 변환 결과 (옵션) | MVP 안 함 (변환 비용 낮음) |
| 브라우저 메모리 | manifest.json | SSE `manifest-changed` 신호 시 무효화 |
| 브라우저 메모리 | /content/<hash> | SSE `content-changed` 신호 시 해당 hash 만 |
| 브라우저 HTTP 캐시 | 정적 자산 (이미지) | `Cache-Control` 헤더 (단기) |
| GH Pages CDN | 정적 파일 | 새 deploy 시 자동 (1~5분 지연) |

라이브 모드에서 *캐시 갱신 안 됨* 사고 방지:
- 변환 결과 캐시는 MVP 에서 안 만듬 (변환이 빠르므로 매번 새로 변환)
- 자산 위치 인덱스는 rename/delete 이벤트로 즉시 무효화
- 명령어 "Notedrop: Clear preview cache" 추가 (만일을 위한 수동 리셋)

## 6.6 SSE 이벤트 형식

```
event: changed
data: {"hash":"aB3xK9","type":"content"}

event: changed
data: {"hash":"aB3xK9","type":"manifest"}

event: removed
data: {"hash":"aB3xK9"}
```

브라우저 측:
```ts
const sse = new EventSource('/__events')
sse.addEventListener('changed', (e) => {
  const { hash, type } = JSON.parse(e.data)
  if (type === 'content') contentClient.invalidate(hash)
  if (type === 'manifest') manifestClient.invalidate()
})
sse.addEventListener('removed', (e) => {
  const { hash } = JSON.parse(e.data)
  contentClient.invalidate(hash)
  manifestClient.invalidate()
})
```

prod 빌드에서는 `/__events` 가 없으므로 `EventSource` 가 silently 실패 → 정상 (LiveReloadProvider 가 try-catch).

## 6.7 동시성 시나리오

| 시나리오 | 동작 |
|---|---|
| 발행 중 vault 파일 수정 | publish 시작 시 snapshot 시점 고정. 그 후 변경은 다음 publish |
| 동시 publish 호출 (여러 명령어 빠르게) | publish 함수에 mutex - serialize |
| 라이브 서버 SSE 송신 중 PublishIndex 갱신 | PublishIndex 조회는 atomic (Map). 송신 중인 데이터는 호출 시점 snapshot |
| 외부 git 수정 후 publish 시도 | push 가 non-fast-forward 로 실패 → 사용자에게 선택권 (force / 취소) |
| 빠른 연속 vault 수정 (자동저장) | SSE 송신 디바운스 (200ms) - 마지막 변경만 전파 |
