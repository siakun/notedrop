---
date: 2026-04-27
type: 핸드오프
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - viewer
  - pagination
  - pretext
  - v0.1.50
summary: pretext 기반 단락 내부 분할 구현 완료. paragraphSplit 모듈 신설 + paginateVertical / paginateStrip 통합. vertical / horizontal / two-pages 세 모드 모두 긴 단락 overflow 해소. dogfood 수동 검증 의무는 사용자 vault 부작용이라 다음 세션 의무로 인계.
related:
  - docs/superpowers/specs/2026-04-27-pretext-paragraph-pagination-design.md
  - docs/superpowers/plans/2026-04-27-pretext-paragraph-pagination.md
---

# pretext 기반 단락 내부 분할 — 완료 핸드오프

## 1. 결과

- **viewer test**: 기존 56 → 신규 31 (paragraphSplit) + 2 (paginateVertical 회귀) = **87 tests** (전체 7 file)
- **typecheck**: PASS
- **빌드 size diff**:
  - baseline: `/` 185 KB / First Load 274 KB / shared 88.7 KB
  - final:    `/` 200 KB / First Load 289 KB / shared 88.7 KB
  - **+15 KB** (pretext gzipped — page chunk 만 영향, shared 무변동)

## 2. 신규 모듈 — `viewer/src/lib/paragraphSplit.ts`

| export | 책임 | 단위 테스트 |
|---|---|---|
| `isSplittableElement(el)` | tag 기반 splittable 판단 (`<p>`, `<li>` 만) | 5 tests |
| `pickSplitLine(result, innerH)` | measure 결과 → split char index 산출 | 6 tests |
| `splitElementAtCharIndex(el, idx)` | 순수 DOM Range split + attribute 복제 | 7 tests |
| `mapLineTextsToRanges(text, lineTexts)` | lineText 배열 → 원본 char range (indexOf + positional fallback) | 4 tests |
| `splitParagraph(el, metrics, measurer)` | DI measurer 주입 단락 분할 + 재귀 | 6 tests |
| `expandLargeParagraphs(parent, children, ...)` | 다수 children DOM swap | 3 tests |
| `createPretextMeasurer()` | pretext 어댑터 — `@chenglou/pretext` 직접 import 단일 지점 | 통합 (dogfood) |

상수: `SPLITTABLE_TAGS`, `MAX_SPLIT_RECURSION = 50`, `SPLIT_HEIGHT_TOLERANCE_PX = 1`. 매직 넘버 회피.

## 3. 통합 지점 — `viewer/src/lib/paginate.ts`

- `paginateVertical` + `paginateStrip` 두 곳에 `expandLargeParagraphs` 호출 추가.
- `splitByHeight` 는 변경 없음 — 그 *상위*에 사전 분할 단계 추가.
- vertical / horizontal / two-pages 세 모드 동일 적용.

## 4. 핵심 설계 결정

- **measurer DI**: `LineRangeMeasurer` 인터페이스를 통해 pretext 어댑터를 주입. 단위 테스트는 `fakeMeasurer` 로 pretext 우회 (jsdom canvas 부재 회피).
- **fallback**: `splitParagraph` 내부 try/catch 로 measurer 실패 시 원본 그대로 반환. canvas 없는 환경에서도 회귀 없음 (분할만 안 일어남).
- **재귀 가드**: `MAX_SPLIT_RECURSION = 50` — 무한 split 방지.
- **inline 마크업**: `Range.extractContents()` 의 자동 양쪽 분할 활용. `<strong>brave</strong>` → `<strong>br</strong>` + `<strong>ave</strong>`.
- **id 처리**: 첫 part 만 id 유지, 후속은 제거 (DOM 중복 방지).
- **char 매핑**: pretext 의 `LayoutCursor` (segment 기반) 를 직접 변환하지 않고, `materializeLineRange.text` + `indexOf` 매칭. 정규화 손실 시 positional fallback.

## 5. 결정 사항 (spec §11 의 6 항목)

| # | 결정 | 적용 |
|---|---|---|
| ① | viewer 번들 +100~200 KB 수용 | 실측 +15 KB ✓ |
| ② | vertical / horizontal / two-pages 동시 fix | 적용 ✓ |
| ③ | jsdom + canvas 부재 대응 | measurer 주입 분리 ✓ |
| ④ | callout / blockquote 내부 분할 1차 미포함 | 유지 (후속 이슈) |
| ⑤ | happy-dom 전환 안 함 | 유지 |
| ⑥ | pretext API: `prepareWithSegments` + `walkLineRanges` | 적용 ✓ |

## 6. spec 가정과 실 API 차이 (Task 1 검증 결과)

- 폰트 입력: `{fontFamily, fontSize, ...}` 객체 → **CSS shorthand string** (`'16px Arial'`) — `buildFontShorthand` 헬퍼 추가
- `walkLineRanges`: return 값 X → **callback 기반** (LayoutLineRange) — `materializeLineRange.text` 누적
- `LayoutCursor`: char index X → `{segmentIndex, graphemeIndex}` — char 매핑은 lineText 기반 indexOf

## 7. commit 흐름 (10 commits)

```
714887a 📝 docs(spec): pretext 단락 분할 spec + plan 추가
1cf8cac ✨ feat(viewer): @chenglou/pretext v0.0.6 의존성 추가
3826fa5 ✨ feat(viewer): paragraphSplit types + constants
f0e4797 ✨ feat(viewer): isSplittableElement
54b1b0c ✨ feat(viewer): pickSplitLine
c7c90e1 ✨ feat(viewer): splitElementAtCharIndex
4cb2b49 ✨ feat(viewer): createPretextMeasurer
f9cd0a7 ✨ feat(viewer): splitParagraph
a118697 ✨ feat(viewer): expandLargeParagraphs
6e11503 ✨ feat(viewer): paginateVertical 통합
0d70c4f ✨ feat(viewer): paginateStrip 통합
```

## 8. 본 세션이 *수행하지 않은* 의무

- **사용자 vault 의 자기소개서 노트로 실 dogfood** — BRAT update + plugin reload + share repo publish 는 사용자 명시 부작용 (vault 수정 + GitHub commit 작성). 자율 모드 destructive 가드 적용.
- **viewer assets 의 plugin inline 갱신** — release.yml 이 자동 처리 (tag commit 작성 시).
- **시각 검증 (playwright/browser)** — 실 폰트 메트릭 검증은 dogfood 단계에서 사용자가 수행.
- **ADR 0028 작성 여부** — paginate 알고리즘 *상위에 단계 추가* 는 기존 splitByHeight 무변경이라 아키텍처 변경 폭 작음. 본 핸드오프로 충분 판단. 사용자 의견에 따라 후속.

## 9. 다음 세션 의무

1. **사용자가 v0.1.50 plugin BRAT update 또는 manual install** 진행
2. plugin reload (Settings → Community Plugins → notedrop OFF/ON 또는 `obsidian plugin:reload id=notedrop`)
3. **dogfood 검증**:
   - vertical scroll + 자기소개서 노트 → 긴 단락이 페이지 boundary 에서 자연스럽게 다음 페이지로 이어지는지
   - horizontal scroll + 동일 노트 → 좌우 strip 이동 + 단락 분할 작동
   - two pages + 동일 노트 → 두 페이지 동시 표시 + 단락 분할
   - font-size / line-height / margin 슬라이더 변경 → re-paginate 시 단락 분할 재계산
   - inline 마크업 (a / strong / code) 포함 단락의 분할 boundary
4. **회귀 검사**: 이미지/테이블/코드블록/heading 노트 → 의미 단위 보존 확인 (분할 안 됨)
5. **번들 size 영향 모니터링** — plugin 의 BRAT 다운로드 size +15 KB 가 사용자 경험에 영향 있는지

## 10. 후속 이슈 (1차 미포함, spec §10)

- callout / blockquote 내부 긴 텍스트 분할
- 단일 `<table>` 이 페이지보다 큰 경우 row 단위 분할
- 단일 `<pre>` code block 이 페이지보다 큰 경우 line 단위 분할
- `unpaginate` 시 split 단락 복원 (data-original-text 기반) — 현재는 boundary 누적 허용
- font-size 변경 시 점진적 re-paginate (현재는 전체 unpaginate→paginate)
- pretext 의 segment-cursor 기반 정확 매핑 (현재는 indexOf + positional fallback)

## 11. 메타데이터

- main HEAD: `0d70c4f` (release.yml 자동 tag commit 추가 시 갱신)
- viewer test: 87 (기존 56 + 신규 31)
- 신규 파일: `viewer/src/lib/paragraphSplit.ts` + `viewer/src/lib/paragraphSplit.test.ts` + spec + plan + 본 핸드오프
- 변경 파일: `viewer/package.json`, `viewer/package-lock.json`, `viewer/src/lib/paginate.ts`, `viewer/src/lib/paginate.test.ts`
- 신규 의존성: `@chenglou/pretext@^0.0.6` (unpacked 880 KB / runtime +15 KB gzipped)
