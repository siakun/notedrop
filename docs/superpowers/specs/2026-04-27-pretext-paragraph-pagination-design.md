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
related:
  - docs/13-dogfood-ux-requirements.md
  - viewer/src/lib/paginate.ts
summary: viewer 의 paper-page 가 긴 단락 1개를 페이지 안에서 줄 단위로 자르지 못해 overflow:hidden 으로 잘려 보이는 문제. @chenglou/pretext 로 단락의 줄별 char range 를 측정하고 DOM Range 로 단락을 다중 단락으로 split 한 뒤 기존 splitByHeight 에 투입.
---

# pretext 기반 단락 내부 분할 설계

## 1. 배경 / 문제

`viewer/src/lib/paginate.ts:16-30` 의 `splitByHeight` 가 자식 element 단위(주로 `<p>`, `<h*>`, `<ul>` 등 markdown 블록)로만 페이지를 자른다. 단일 자식 height 가 페이지 inner height 를 초과하면 다음 가드 때문에 자르지 못한다.

```ts
if (used + h > limit && last.length > 0) {
  groups.push([])
  used = 0
}
```

`last.length > 0` 가드 — 새 그룹이 비어 있으면 한 자식이 limit 을 초과해도 그대로 push. 그리고 `globals.css:467` 의 `.paper-page { overflow: hidden }` 이 초과분을 잘라낸다.

자기소개서처럼 한 단락이 30 줄 넘게 이어지면 단락 1개가 통째로 페이지 1개에 박혀서 페이지 경계 아래로 흘러넘친 부분이 잘려 보인다 (사용자 screenshot 의 "지금까지의 제 성장 궤적은..." 단락).

같은 로직이 `paginateStrip` 에도 있어 horizontal/two-pages 모드도 동일 결함을 갖는다.

## 2. 목표 / 비목표

**목표**:
- 단일 단락이 페이지 inner height 를 초과할 때 단락 내부의 줄 경계에서 자동으로 분할되어 다음 페이지로 자연스럽게 이어진다.
- vertical, horizontal, two-pages 세 모드 모두에 동일하게 적용된다.
- 기존 단락 단위 splitByHeight 의 동작은 그대로 유지하고, 그 *상위*에 사전 분할 단계만 추가한다 (회귀 위험 최소).

**비목표**:
- callout / blockquote / table / code block / image 내부의 분할 — 의미 단위 보존이 우선. 후속 이슈로 분리.
- paginate 시점을 client → server 로 이동하는 아키텍처 변경.
- font-size 변경마다 점진적 re-paginate (현재 unpaginate→re-paginate 흐름 그대로).

## 3. 의존성

- 신규: `@chenglou/pretext` ^0.0.6 (npm). unpacked 880 KB / 61 files. minify+gzip 후 viewer 번들 증가량 추정 약 100-200 KB.
- 영향: viewer 빌드 자산이 plugin 에 inline 되므로 plugin BRAT 다운로드 size 도 동일량 증가. 트레이드오프 수용 (overflow 해결 가치 우선).

## 4. 아키텍처

신규 모듈: `viewer/src/lib/paragraphSplit.ts`.

기존 흐름:

```
content children → splitByHeight → 페이지 그룹
```

신규 흐름:

```
content children → expandLargeParagraphs → splitByHeight → 페이지 그룹
                   ↑
                   pretext 기반 사전 분할
```

`paginate.ts` 의 `splitByHeight` 와 페이지 DOM 조립 코드는 변경 없음. `paginateVertical` 과 `paginateStrip` 두 곳에서 `splitByHeight` 호출 직전에 `expandLargeParagraphs` 를 호출.

## 5. 모듈 책임

### 5.1 `paragraphSplit.ts` 공개 API

```ts
export type SplitMetrics = {
  innerWidthPx: number
  innerHeightPx: number
}

// 단일 element 분할.
// splittable 한 element 면 새 element 배열 (최소 1개) 을 반환. 부모 DOM 에서
// 원본 element 자리에 swap 하는 책임은 호출자가 진다.
export function splitParagraph(
  el: HTMLElement,
  metrics: SplitMetrics
): HTMLElement[]

// 자식 배열 전체에 대해 큰 splittable element 만 골라 분할 후 평탄화.
// DOM 도 같이 swap 한다 (호출자가 안 해도 됨).
export function expandLargeParagraphs(
  parent: HTMLElement,
  children: HTMLElement[],
  metrics: SplitMetrics
): HTMLElement[]
```

### 5.2 `splitParagraph` 알고리즘

1. **splittable 판단** — `<p>` 와 `<li>` 는 splittable. 그 외는 원본 그대로 단일 배열로 반환.
2. **height 게이트** — `el.offsetHeight <= innerHeightPx` 면 분할 불필요. 단일 배열로 반환.
3. **plain text 수집** — `el.textContent` (innerText 가 아닌 textContent — pretext 가 줄바꿈/공백 정규화는 입력 텍스트에 따라 결정).
4. **font 메트릭 수집** — `getComputedStyle(el)` 에서:
   - `font-family`, `font-size`, `font-weight`, `font-style`
   - `line-height` (px 변환)
   - `letter-spacing`
   - `white-space`, `word-break`
5. **pretext 호출**:
   ```ts
   const seg = pretext.prepareWithSegments(text, {
     fontFamily, fontSize, fontWeight, fontStyle,
     lineHeight, letterSpacing,
     whiteSpace, wordBreak,
     width: innerWidthPx,
   })
   const lineRanges = pretext.walkLineRanges(seg)  // [{ startIdx, endIdx }, ...]
   ```
6. **분할 지점 산출** — 줄 1개 height = `lineHeight`. 페이지에 들어갈 수 있는 줄 수 `K = floor(innerHeightPx / lineHeight)`. K 가 0 이거나 lineRanges.length <= K 면 분할 불필요 (이론상 안 일어나지만 가드).
7. **DOM split** — 원본 `<p>` 에서 char index `lineRanges[K-1].endIdx` 위치를 boundary 로 잡고:
   - TreeWalker 로 textNode 순회
   - 누적 char count 가 boundary 도달하는 textNode 찾음
   - `Range.setStart(textNode, offsetInTextNode)` + `range.setEndAfter(el.lastChild)` 로 후반부 추출
   - `range.extractContents()` → DocumentFragment
   - 새 element 를 만들고 fragment 를 append. 신규 element 는:
     - `tagName` 동일
     - `className` 복제
     - 그 외 attribute (data-*, aria-*, role 등) 복제
     - `id` 는 첫 part 만 유지 (후속 part 는 id 제거 — DOM 중복 방지)
8. **재귀** — 후반부 element 도 여전히 height > innerHeightPx 면 다시 splitParagraph 호출. 재귀 depth 제한 (예: 50) 으로 무한 루프 가드.
9. **결과 반환** — 분할된 element 배열 (원본 + 후속 N 개).

### 5.3 inline 마크업 처리

`<p>` 안에 `<a>`, `<strong>`, `<code>`, `<mark>` 등 inline 자식이 섞여 있을 수 있다. pretext 는 plain text 입력만 받고 char index 단위로 줄을 산출한다. DOM split 이 char index 를 따라가면 inline 자식 boundary 가 split 지점 안쪽일 수 있다. `Range.setStart(textNode, offset)` + `extractContents()` 는 inline 자식을 split 지점 기준으로 자동 분할 (`<strong>foo|bar</strong>` → `<strong>foo</strong>` + `<strong>bar</strong>`) — 브라우저 내장 동작. 별도 처리 불필요.

이미지 / 임베드처럼 텍스트 길이 0 인 inline 자식은 plain text 추출 시 char count 에 0 을 차지하므로 split 위치 계산에서 무시되고 한쪽 단락에 그대로 남는다.

### 5.4 `expandLargeParagraphs` 알고리즘

```
output = []
for child in children:
  if child not splittable:
    output.push(child)
    continue
  if child.offsetHeight <= innerHeightPx:
    output.push(child)
    continue
  parts = splitParagraph(child, metrics)
  // DOM swap: 원본 자리에 parts 를 순서대로 삽입, 원본 제거
  for part in parts:
    parent.insertBefore(part, child)
  parent.removeChild(child)
  output.push(...parts)
return output
```

**전제**: 호출 시점에 `children` 은 이미 measure 컨테이너 (paper-page) 안에 들어가 있어 `offsetHeight` 가 의미 있는 값을 가진다. `paginateVertical` / `paginateStrip` 는 이미 measure 단계를 수행하므로 그 직후에 호출.

## 6. 통합 지점

### 6.1 `paginateVertical`

```diff
 export function paginateVertical(content, settings): void {
   ...
   const initialPage = createPaperPage()
   for (const child of flat) initialPage.appendChild(child)
   content.innerHTML = ''
   content.appendChild(initialPage)

+  const innerWidthPx = mmToPx(
+    PAGE_DIMS[settings.pageSize].w - settings.marginLeft - settings.marginRight
+  )
+  const expanded = expandLargeParagraphs(initialPage, flat, {
+    innerWidthPx,
+    innerHeightPx,
+  })
+  const heights = expanded.map((c) => c.offsetHeight)
+  const groups = splitByHeight(heights, innerHeightPx)
-  const heights = flat.map((c) => c.offsetHeight)
-  const groups = splitByHeight(heights, innerHeightPx)

   content.innerHTML = ''
   for (const group of groups) {
     const page = createPaperPage()
-    for (const idx of group) page.appendChild(flat[idx]!)
+    for (const idx of group) page.appendChild(expanded[idx]!)
     content.appendChild(page)
   }
 }
```

### 6.2 `paginateStrip`

`fit.innerHeight` + `fit.width - fit.padLeft - fit.padRight` 로 metrics 산출 후 동일 패턴 적용.

## 7. splittable 판단 규칙

| element | splittable | 비고 |
|---|---|---|
| `<p>` | yes | 가장 흔한 케이스 |
| `<li>` | yes | `<li>` 자체가 텍스트 위주일 때만. 자식에 `<p>` 가 있는 markdown loose list 는 `<p>` 가 다시 splittable |
| `<h1>`~`<h6>` | no | 짧음. heading 1 개가 페이지보다 큰 경우는 입력 데이터 이슈 |
| `<pre>`, `<code>` block | no | 줄 의미 보존 |
| `<table>` | no | 1차에서 분할 안 함 |
| `<img>`, `<picture>`, mermaid `<svg>` | no | 시각 단위 |
| `<blockquote>`, `.callout` | no | 의미 단위 우선. 후속 이슈로 |
| `<ul>`, `<ol>` 컨테이너 | no | 컨테이너 자체는 분할 X. 자식 `<li>` 가 splittable |

판단 helper: `isSplittableElement(el: HTMLElement): boolean` — tagName 기반.

## 8. 테스트 전략

### 8.1 단위 테스트

- **`paragraphSplit.test.ts`** (신규):
  - `isSplittableElement` — tag 별 분류 검증
  - `splitParagraphAtCharIndex(el, charIdx)` — pretext 와 무관한 *순수 DOM split* 함수만 분리해서 jsdom 에서 검증. inline 마크업 boundary 케이스, 다중 textNode, 빈 element 등.
  - `pickSplitLine(lineRanges, lineHeight, innerHeightPx)` — pretext 결과 (가짜 lineRanges 입력) 만 받아 K 줄 산출 + boundary char idx 반환. 순수 함수 — 단위 테스트 100% 가능.
- **`paginate.test.ts` 보강**:
  - `expandLargeParagraphs` 가 height 초과 element 에 대해 `splitParagraph` mock 을 호출하는지 spy 로 검증.
  - splittable 아닌 element 는 그대로 통과하는지.
  - height 미만 splittable element 는 그대로 통과하는지.

### 8.2 jsdom + canvas 부재 대응

pretext 는 canvas 를 폰트 메트릭에 사용 → jsdom 에서 호출 시 측정 결과가 0 또는 NaN 일 가능성. 대응:
- `splitParagraph` 의 *pretext 호출 부분만* 캡슐화 → 단위 테스트에서는 fake measure 를 inject.
- 통합 검증은 dogfood (실 브라우저) 로.

```ts
// paragraphSplit.ts
export type LineRangeMeasurer = (text: string, style: FontStyle, widthPx: number) =>
  { lineHeight: number; lines: { startIdx: number; endIdx: number }[] }

export function createPretextMeasurer(): LineRangeMeasurer { ... }  // pretext 사용

export function splitParagraph(
  el, metrics, measurer = createPretextMeasurer()
): HTMLElement[] { ... }
```

테스트에서는 `measurer` 를 inject 하여 pretext 호출을 우회.

### 8.3 dogfood 수동 검증

`notedrop-dogfood-automation` skill 활용 — 사용자 vault 의 자기소개서 노트로 vertical / horizontal / two-pages 모드 각각에서 페이지 경계 시각 확인.

## 9. 회귀 risk

| risk | 완화 |
|---|---|
| 짧은 단락에 추가 비용 | height 게이트 (offsetHeight <= innerHeight) 로 pretext 호출 회피 |
| pretext 측정 실패 시 (canvas 부재 등) | splitParagraph 가 try/catch — 실패 시 원본 그대로 반환 (현행 동작 유지). logger.warn 으로 기록 |
| 무한 재귀 | depth 제한 + 이전 split 결과의 길이 변화 없으면 중단 |
| inline 마크업 splitting 결과의 시맨틱 손상 | `<a>` 가 두 동일 href 로 분리되는 정도 — 시각/접근성 영향 미미 |
| markdown re-render 흐름과 충돌 | `unpaginate` 가 split 된 단락을 그대로 다시 합치는지 검증 — 현재 `unpaginate` 는 paper-page 를 풀고 children 을 그대로 content 로 옮김. split 된 `<p>` 들이 복수로 남는다. 다음 paginate 에서는 짧아진 단락이 splittable 게이트를 통과 못 하므로 pretext 호출 안 함. 단 *복원성* 측면에서 원본 단락 1개로 되돌릴 수 없음 → re-paginate 시 분할 boundary 가 누적되어 다른 위치에 재분할 가능. **개선안**: split 시 원본 textContent 를 first part 의 `data-original-text` 에 저장 → unpaginate 시 다시 합침. **1차 구현에서는 단순화** 채택 (boundary 누적 허용, 시각 영향 미미). 후속 이슈로 분리. |

## 10. 후속 이슈 (이번 spec 외)

- callout / blockquote 내부 긴 텍스트 분할
- 단일 `<table>` 이 페이지보다 큰 경우 row 단위 분할
- 단일 `<pre>` code block 이 페이지보다 큰 경우 line 단위 분할
- font-size 변경 시 점진적 re-paginate (현재는 전체 unpaginate→paginate)
- unpaginate 시 split 된 단락 복원 (data-original-text 기반)

## 11. 결정 사항 (사용자 승인)

| # | 결정 |
|---|---|
| ① | viewer 번들 +100-200KB (gzipped) 수용 |
| ② | vertical / horizontal / two-pages 동시 fix |
| ③ | jsdom 단위 테스트는 measurer 주입 분리, 실 측정은 dogfood |
| ④ | callout/blockquote 내부 분할 1차 미포함 |
| ⑤ | happy-dom 전환 안 함 (분리 설계로 회피) |
| ⑥ | pretext API 모드 = `prepareWithSegments` + `walkLineRanges` |

## 12. 구현 순서 (대략)

1. `@chenglou/pretext` 추가 + viewer 번들 size 측정
2. `paragraphSplit.ts` — 순수 함수 (`isSplittableElement`, `pickSplitLine`, `splitParagraphAtCharIndex`) 단위 테스트 우선
3. `createPretextMeasurer` + `splitParagraph` 통합
4. `expandLargeParagraphs` 통합
5. `paginate.ts` 두 곳에 expandLargeParagraphs 호출 추가
6. `paginate.test.ts` 보강
7. dogfood (자기소개서 노트, 세 layout)
8. 번들 size diff 측정 + 회귀 검증
9. ADR 0028 (예정 번호) — paginate 알고리즘에 사전 분할 단계 도입 + pretext 의존성 추가. 구현 plan 단계에서 작성 여부 최종 결정 (ADR 가 필요할 정도의 아키텍처 변경인지 회의)
