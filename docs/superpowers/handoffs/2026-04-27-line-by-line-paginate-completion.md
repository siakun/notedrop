---
date: 2026-04-27
type: 핸드오프
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - viewer
  - pagination
  - line-based
  - v0.1.52
summary: paginate 1차 단위를 element 에서 line 으로 변경. splitByHeight 폐기, 3 단계 파이프라인 (buildLineStream → splitByLineHeight → renderLineGroups). settings + window resize 변경 시 line 단위 즉시 반응. heading orphan 방지 + <li> 단위 분할. 사용자 dogfood 의무는 BRAT update + share repo publish.
related:
  - docs/superpowers/specs/2026-04-27-line-by-line-paginate-design.md
  - docs/superpowers/plans/2026-04-27-line-by-line-paginate.md
---

# line-단위 paginate (Option C) — 완료 핸드오프

## 1. 결과

- **viewer test**: 84 (lineStream 22 신규 + paragraphSplit 11 (정리) + paginate 7 + 기타 44)
- **typecheck**: PASS
- **빌드 size**: `/` 201 KB / First Load 290 KB (v0.1.51 와 동일 — 큰 변동 없음)
- **release**: v0.1.52 (run `24987196203` ✓)

## 2. 신규 모듈 — `viewer/src/lib/lineStream.ts`

| export | 책임 | 단위 테스트 |
|---|---|---|
| `Line` / `LineKind` / `LineStreamMetrics` / `SourceGroup` (type) | 데이터 구조 | — |
| `SHORT_PARAGRAPH_RATIO = 1.5` (const) | 짧은 단락 measure skip 임계 | — |
| `isInlineSplittable / isHeading / isUnitElement / isListContainer` | tag 분류 | — |
| `buildLineStream(children, metrics, measurer)` | element[] → Line[] | 7 tests |
| `splitByLineHeight(lines, innerH)` | Line[] → page groups (heading orphan 방지) | 8 tests |
| `groupLinesBySource(lines)` | 연속 same source line 묶음 | 2 tests |
| `renderLineGroups(parent, groups)` | Line[][] → DOM (paper-page + list re-wrap + source split) | 5 tests |

## 3. 알고리즘 흐름

```
content.children
  ↓ measure 컨테이너 임시 배치 (offsetHeight 측정 가능)
  ↓
buildLineStream
  ├ <p>, <li>: measurer 호출 → N line (또는 짧으면 1 line skip)
  ├ heading: 1 line + breakAfterAvoid
  ├ unit (pre/table/img/blockquote/callout/hr): 1 line
  └ list (ul/ol): 자식 li 재귀
  ↓ Line[]
  ↓
splitByLineHeight (heading orphan 방지)
  ↓ Line[][] (page groups)
  ↓
renderLineGroups
  ├ each group → paper-page
  ├ same source 의 연속 line 들 → 한 element
  ├ source split 시 → splitElementAtCharIndex
  └ list-item 들 → 새 <ul>/<ol> 으로 wrap
```

## 4. 핵심 설계 결정

### 4.1 element → line 단위
이전: splitByHeight 가 element offsetHeight 누적 → group boundary 가 *element 단위*. 1mm 변동 흡수.
이후: line stream + line height 누적 → boundary 가 *line 단위*. 1mm 변동도 line break 위치 변경 가능.

### 4.2 heading orphan 방지
heading 다음 line 이 같은 page 에 들어갈 수 없을 때:
- heading + next 가 새 page 에 같이 들어갈 수 있으면 → 둘 다 다음 page 로 이동
- 안 들어가면 (combined > limit) → 그대로 (limit 초과 강제 묶음 회피)

### 4.3 짧은 단락 measure skip
`offsetHeight ≤ lineHeight × 1.5` 면 measurer 호출 X, line 1 개로 처리. pretext 호출 비용 절감.

### 4.4 measurer 실패 fallback
canvas 부재 환경 (jsdom 단위 테스트, SSR 등) 에서 try/catch. 실패 시 element 단위 1 line.

### 4.5 list re-wrap
원본 `<ul>` / `<ol>` 의 자식 `<li>` 들이 다른 page 에 split 되면 각 page 에서 새 `<ul>` / `<ol>` 만들어서 wrap. attribute 복제 (className 등). id 제외.

### 4.6 inline 마크업 보존
`splitElementAtCharIndex` (paragraphSplit 의 검증된 로직) 활용. `<strong>brave</strong>` → `<strong>br</strong>` + `<strong>ave</strong>` 자동 split.

## 5. window resize listener

`useLayoutPagination` 가 200ms debounce listener 등록. resize 시:
- `lastRootRef.current` 확인 → 있으면 `runPaginate(root)` 호출
- markdown 재처리 X — paginate 만
- settings 변경 흐름과 동일 진입점 (cleanup + paginate 일관)

## 6. 폐기 항목

| 모듈 | 함수 / 타입 | 사유 |
|---|---|---|
| paginate.ts | `splitByHeight` | line-단위가 superset |
| paragraphSplit.ts | `splitParagraph`, `expandLargeParagraphs` | element-단위 분할 — 새 알고리즘이 자체로 처리 |
| paragraphSplit.ts | `pickSplitLine`, `isSplittableElement`, `readFontStyle` | 새 알고리즘에서 lineStream 의 자체 helper 사용 |
| paragraphSplit.ts | `SPLITTABLE_TAGS`, `MAX_SPLIT_RECURSION`, `SPLIT_HEIGHT_TOLERANCE_PX`, `SplitMetrics` | 동일 |
| paragraphSplit.ts | `ParagraphDiag` + `window.__notedropParagraphDiag` | dogfood 진단 인프라 — 옛 알고리즘 전용 |

## 7. 유지 항목 (재사용)

- `splitElementAtCharIndex` — DOM Range 기반. `renderLineGroups` 가 사용
- `mapLineTextsToRanges` — pretext lineText → char range. `createPretextMeasurer` 가 사용
- `createPretextMeasurer` — pretext 어댑터 단일 진입점. `lineStream` 이 사용
- type: `FontStyle`, `LineRange`, `MeasureResult`, `LineRangeMeasurer`

## 8. 결정 사항 (spec §11)

| # | 결정 | 적용 |
|---|---|---|
| ① | splitByHeight 폐기 | ✓ |
| ② | window resize listener | ✓ debounce 200ms |
| ③ | settings 변경 시 markdown re-render skip | △ (별도 task — 본 release 범위 외) |
| ④ | heading orphan 방지 | ✓ default |
| ⑤ | list `<li>` 단위 분할 (depth 1) | ✓ |
| ⑥ | 코드/테이블/이미지: 단위 점유 | ✓ |

## 9. commit 흐름 (10 commits)

```
593dc13 ✨ feat(viewer): lineStream types + tag 분류
ba02ef5 ✨ feat(viewer): splitByLineHeight — Line[] → page groups
a9e0c84 ✨ feat(viewer): buildLineStream — element[] → Line[]
24f6ea9 ✨ feat(viewer): groupLinesBySource + renderLineGroups
1094ee2 ♻️ refactor(viewer): paginateVertical/Strip → line-단위 파이프라인
ceac95f ✨ feat(viewer): window resize listener (debounce 200ms)
1190904 🔥 remove(viewer): paragraphSplit 의 element-단위 함수 폐기
0d860ff 🔖 release(v0.1.52): line-단위 paginate 알고리즘
```

## 10. 본 세션이 *수행하지 않은* 의무

- **사용자 vault 의 자기소개서 노트로 실 dogfood** — BRAT update + plugin reload + share repo publish 는 사용자 명시 부작용. v0.1.51 dogfood 에서 확인된 measurerErrors=0, splitParagraphs=0 패턴이 v0.1.52 에서 어떻게 바뀌는지 검증 필요.
- **share repo 의 viewer 자산 갱신** — 사용자 publish 명령 실행 의무. publish 안 하면 production GH Pages 는 영원히 옛 viewer.
- **시각 검증 (browser-use)** — 사용자 환경 시뮬레이션 + margin 25→30 단계별 reproduction 후 *line 단위 변화* 확인.
- **ADR 0028 작성** — paginate 알고리즘 line-단위 재설계 + splitByHeight 폐기 사유. 후속.

## 11. 다음 세션 의무

1. **사용자가 v0.1.52 plugin BRAT update 또는 manual install** 진행
2. plugin reload (Settings → Community Plugins → notedrop OFF/ON)
3. **dogfood 검증**:
   - 자기소개서 (긴 단락 다수) 노트로 vertical / horizontal / two-pages 모드
   - margin 25→26→...→30 1mm 변경 시 *line 단위* 변화 확인 (이전 element 단위와 차이)
   - window resize 시 paginate 자동 재실행 확인 (debounce 200ms 후)
   - heading orphan 방지 동작 확인 (heading 이 페이지 끝에 안 옴)
   - inline 마크업 (a/strong/code) 포함 단락의 line split boundary 의미 보존
   - list (`<ul>`) 가 page boundary 에 걸쳐 split 시 list-style 보존
4. **회귀 검사**: 짧은 단락만 있는 노트 / 표 / 코드 블록 / 이미지 — 의미 단위 보존
5. **사용자 publish 실행** — share repo 에 v0.1.52 viewer 자산 갱신
6. **production GH Pages 검증** — v0.1.50 의 옛 viewer 잔재 해소

## 12. 후속 이슈 (1차 미포함)

- `<table>` row 단위 분할
- `<pre>` / `<code>` block 의 line 단위 분할
- 중첩 list 의 깊은 split (depth 2+)
- print CSS @media (page break) 통합
- settings 변경 시 markdown re-render skip → paginate-only fast path
- `<img>` 가 페이지보다 큰 경우 자동 scale-to-fit
- ADR 0028 작성 — paginate 재설계 + splitByHeight 폐기 사유 + 옵션 A/B/C 비교

## 13. 메타데이터

- main HEAD: `0d860ff` (release v0.1.52)
- viewer test: 84 (84 pass)
- 신규 파일: `viewer/src/lib/lineStream.ts` + `lineStream.test.ts`
- 폐기: `viewer/src/lib/paginate.ts` 의 splitByHeight + `paragraphSplit.ts` 의 element-단위 함수 9건
- 빌드 size: `/` 185 KB → 201 KB → 201 KB (v0.1.51 = v0.1.52, line-단위로도 변화 없음)
