---
date: 2026-04-27
type: design-spec
status: draft
generated_by: ai-assisted
tags:
  - notedrop
  - viewer
  - pagination
  - pretext
  - line-based
related:
  - docs/superpowers/specs/2026-04-27-pretext-paragraph-pagination-design.md
  - viewer/src/lib/paginate.ts
  - viewer/src/lib/paragraphSplit.ts
summary: paginate 1차 단위를 element 에서 line 으로 변경. splitByHeight 폐기, line stream 기반 3 단계 파이프라인 (buildLineStream → splitByLineHeight → renderLineGroups). settings 변경 시 element boundary 단위 흡수 없이 line 단위 즉시 반응. heading orphan 방지 + window resize listener + markdown re-render skip.
---

# line-by-line paginate 재설계 (Option C)

## 1. 배경

v0.1.50 에서 `paragraphSplit` 도입 — 단락이 inner height 를 *초과* 할 때만 줄 단위 분할. 자기소개서처럼 단락이 각각 inner height 안에 들어맞는 자료에서는 `splitParagraphs: 0` (4321 dogfood 측정).

v0.1.51 dogfood 결과 (margin 25→30 단계별):

| margin | pages | innerHeight | splitParagraphs |
|---|---|---|---|
| 25 | 12 | 623.6 | 0 |
| 26 | 13 | 619.8 | 0 |
| 27~30 | 13 | 616~605 | 0 |

→ element 단위 group boundary 가 1mm (3.78 px) 변동을 *흡수*. 사용자 기대 (pretext 데모처럼 매 mm smooth 반응) 미충족.

## 2. 목표 / 비목표

**목표**:
- paginate 1차 단위를 line 으로 변경. element 단위 group 폐기.
- settings (font/margin/lineScale/pageSize/window resize) 변경 시 line 단위 즉시 반응.
- heading orphan 방지 + 의미 단위 element (table/pre/img) 보존.
- vertical / horizontal / two-pages 세 모드 동일 적용.

**비목표**:
- table / pre / image 의 *내부* 분할 (row/line 단위) — 후속 이슈.
- 중첩 list 의 깊은 split — 1차에서는 1 depth `<li>` 만.
- print CSS @media (page break) 통합 — 별개 작업.
- markdown 재처리 회피 (paginate-only 분기) 의 separate task — 본 spec 은 paginate 알고리즘만.

## 3. 데이터 구조

```ts
type Line = {
  source: HTMLElement   // 원본 element (parent reference)
  charStart: number     // textContent 안 char index (-1 = 전체 element)
  charEnd: number       // exclusive (-1 = 전체 element)
  height: number        // line-height 또는 element offsetHeight
  splittable: boolean   // 같은 source 의 연속 line 들을 한 element 로 다시 묶을 수 있는지
  breakAfterAvoid: boolean  // 다음 line 과 분리 금지 (heading orphan 방지)
}
```

`source` 는 *원본* element 의 reference. 같은 source 의 연속 line 들이 한 page 에 모이면 source 그대로 사용. 한 source 의 line 들이 두 page 에 split 되면 splitElementAtCharIndex 로 source 자르기.

## 4. 3 단계 파이프라인

### Stage 1 — `buildLineStream(children, metrics, measurer)`

**입력**: HTMLElement[] (markdown render 결과의 children)
**출력**: Line[]

각 child 의 종류별 처리:

| element 종류 | line 발생 |
|---|---|
| `<p>`, `<li>` (텍스트 위주) | measurer 호출 → N line, 각 line 의 (charStart, charEnd, height = lineHeight, splittable: true) |
| `<h1>`~`<h6>` | line 1 개. height = offsetHeight. **breakAfterAvoid: true** (다음 line 과 분리 금지) |
| `<pre>`, `<table>`, `<img>`, `<blockquote>`, `.callout`, mermaid svg | line 1 개. height = offsetHeight. splittable: false |
| `<ul>`, `<ol>` 컨테이너 | 컨테이너 자체는 line 0 개. 자식 `<li>` 가 line stream 에 직접 기여. 단 같은 list 의 `<li>` 들이 같은 page 에 묶이면 `<ul>` 으로 다시 wrapping. |
| `<hr>` | line 1 개. height = offsetHeight. splittable: false |

**짧은 단락 최적화**: `<p>` 의 offsetHeight 가 lineHeight × 1.5 이하면 measurer 호출 skip → line 1 개로 취급 (height = offsetHeight). 비용 절감.

**measurer 실패 시 fallback**: try/catch — 실패 시 line 1 개 (전체 element) + splittable: false.

### Stage 2 — `splitByLineHeight(lines, innerHeightPx)`

**입력**: Line[] + innerHeightPx
**출력**: Line[][] (page groups)

```
groups = [[]]
used = 0
for i in 0..lines.length:
  line = lines[i]
  next = lines[i+1]
  if used + line.height > innerHeightPx and groups[-1].length > 0:
    if line.breakAfterAvoid and next is null:
      // 마지막 line 이 heading — 그냥 push (orphan 만들기 vs 빈 page)
    else:
      // 새 group 시작
      groups.push([]); used = 0
  groups[-1].push(line); used += line.height
  // breakAfterAvoid 후속 처리
  if line.breakAfterAvoid and used + (next?.height ?? 0) > innerHeightPx:
    // heading 만 마지막에 들어가면 다음 page 로 옮김
    groups[-1].pop()
    groups.push([line]); used = line.height
```

heading orphan 방지 규칙:
- heading 이 group 의 *마지막 line* 이고 다음 line 이 같은 group 에 들어갈 수 없으면 → heading 을 다음 group 의 첫 line 으로 이동.

### Stage 3 — `renderLineGroups(parent, groups)`

**입력**: parent HTMLElement + Line[][]
**출력**: DOM 재구성 (page 별 element)

각 group 마다:
1. 새 paper-page 생성
2. group 의 line 들을 source 별로 grouping (consecutive same source)
3. source 가 splittable + 일부 line 만 group 에 있으면 splitElementAtCharIndex 로 source 의 head 또는 tail 추출
4. source 가 list 아이템 (`<li>`) 이면 부모 `<ul>` 도 동시에 split (group 별로 `<ul>` 새로 만들기)
5. paper-page 에 source / split 결과 append

## 5. heading orphan 방지 알고리즘

heading 의 의미 단위 보존:
- heading + 다음 단락 = 한 의미 unit
- heading 이 페이지 끝에서 단독으로 나타나면 다음 페이지로 push

구현 방법:
- buildLineStream 에서 heading line 에 `breakAfterAvoid: true` 표시
- splitByLineHeight 에서 group push 시 heading 이 마지막이고 *다음 line 이 같은 group 안 들어감* → heading 도 다음 group 으로 이동

## 6. list (`<ul>` / `<ol>`) 처리

`<ul>` 컨테이너는 line stream 에 직접 기여 안 함. 자식 `<li>` 들만 line 발생.

renderLineGroups 가 `<li>` 들을 page 에 배치할 때:
- 같은 `<ul>` 의 `<li>` 들이 한 group 안에 있으면 `<ul>` 새로 만들어서 wrap
- 다른 group 으로 split 되면 각 group 의 `<ul>` 별도 생성

list nesting (`<ul>` 안 `<ul>`) 은 1 depth 만 분할. depth 2 이상의 nested list 는 *outer* `<li>` 단위로만 분할.

## 7. 통합 지점

### 7.1 `paginateVertical`

```diff
 export function paginateVertical(content, settings): void {
   ...
-  const expanded = expandLargeParagraphs(...)
-  const heights = expanded.map(c => c.offsetHeight)
-  const groups = splitByHeight(heights, innerHeightPx)
-  ...
+  const lineStream = buildLineStream(flat, { innerWidthPx, innerHeightPx }, createPretextMeasurer())
+  const lineGroups = splitByLineHeight(lineStream, innerHeightPx)
+  renderLineGroups(content, lineGroups)
 }
```

### 7.2 `paginateStrip`

동일 패턴. `fit.innerHeight` + `fit.width - fit.padLeft - fit.padRight` 사용.

### 7.3 splitByHeight 의 운명

- 폐기. paginate.ts 에서 export 제거.
- 단위 테스트도 폐기.
- 하지만 *순수 함수* 라서 다른 곳에서 사용 가능 — 그런 곳 없으므로 안전.

### 7.4 expandLargeParagraphs / splitParagraph

폐기. paragraphSplit.ts 의 다른 helper (isSplittableElement / splitElementAtCharIndex / pickSplitLine / mapLineTextsToRanges / createPretextMeasurer) 는 신규 buildLineStream 에서 재사용.

## 8. window resize listener

`useLayoutPagination` 에 window resize listener 추가:
- debounce 200ms
- resize 시 paginate 다시 호출 (markdown 재처리 X)

코드:

```ts
useEffect(() => {
  let timer: ReturnType<typeof setTimeout> | null = null
  const onResize = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      // re-paginate
    }, 200)
  }
  window.addEventListener('resize', onResize)
  return () => {
    window.removeEventListener('resize', onResize)
    if (timer) clearTimeout(timer)
  }
}, [])
```

## 9. 테스트 전략

### 9.1 순수 함수 단위 테스트

- `splitByLineHeight(lines, limit)` — line[] 입력, group 출력. heading orphan, page boundary 케이스. 가짜 line[] 사용 — measurer 무관.
- `groupLinesBySource(lines)` — line[] → source 별 묶음. renderLineGroups 의 helper.

### 9.2 통합 단위 테스트

- `buildLineStream(children, metrics, mockMeasurer)` — element 별 line 발생 검증. mock measurer 주입.
- `renderLineGroups(parent, groups)` — DOM 재구성 검증. inline 마크업 보존 / `<ul>` re-wrapping.

### 9.3 회귀 테스트

paginateVertical / paginateStrip 통합 — 짧은 단락 / heading 만 있는 노트 / 표 / 코드 블록.

## 10. 회귀 risk + 완화

| risk | 완화 |
|---|---|
| 기존 paginate 와 다른 페이지 분할 결과 | 의도된 변경 — 사용자 dogfood 로 확인 |
| inline 마크업 split 시맨틱 손상 | splitElementAtCharIndex 의 검증된 로직 (paragraphSplit 단위 테스트 7건 통과) |
| 페이지보다 큰 table/pre | 1 unit 점유 + 잘림. 후속 이슈로 분리 |
| 짧은 단락의 measure 비용 | offsetHeight ≤ lineHeight×1.5 면 measure skip — 단일 line |
| measurer 실패 (canvas 부재) | try/catch — 실패 시 element 단위 line 1 개 fallback |
| ul/ol 의 li 분할 후 wrapping 시 list-style 손실 | `<ul>` re-create 시 className/속성 복제 |

## 11. 결정 사항 (사용자 승인)

| # | 결정 |
|---|---|
| ① | splitByHeight 폐기 |
| ② | window resize listener 추가 (debounce 200ms) |
| ③ | settings 변경 시 markdown re-render 회피 (별도 task — 본 spec 외) |
| ④ | heading orphan 방지 (default) |
| ⑤ | list `<li>` 단위만 분할 (depth 1) |
| ⑥ | 코드/테이블/이미지: 단위 점유 (분할 불가) |

## 12. 후속 이슈 (1차 미포함)

- `<table>` 의 row 단위 분할
- `<pre>` 의 line 단위 분할
- 중첩 list 의 깊은 split
- print CSS @media 통합
- settings 변경 시 markdown re-render skip → paginate-only fast path
- `<img>` 가 페이지보다 큰 경우 자동 scale-to-fit

## 13. 구현 순서 (대략)

1. `Line` type + 상수 정의 (paragraphSplit.ts 에 추가 또는 새 파일 lineStream.ts)
2. `buildLineStream` (mock measurer 단위 테스트)
3. `splitByLineHeight` (순수 함수 단위 테스트, heading orphan 케이스)
4. `groupLinesBySource` + `renderLineGroups` (DOM 재구성 단위 테스트)
5. `paginateVertical` 통합
6. `paginateStrip` 통합
7. window resize listener (useLayoutPagination)
8. dogfood + 번들 size diff
9. ADR 0028 — line-단위 paginate 결정 + 옛 element 단위 splitByHeight 폐기 사유
10. v0.1.52 release
