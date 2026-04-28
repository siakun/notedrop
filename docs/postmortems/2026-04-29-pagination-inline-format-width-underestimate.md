---
date: 2026-04-29
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - postmortem
  - viewer
  - pagination
  - pretext
  - width-measurement
summary: 콘텐츠 영역 모서리 표시 토글이 드러낸 페이지네이션 overflow 회귀. pretext 가 element.textContent 와 단일 font shorthand 만으로 wrap 위치를 측정해서 inline 포맷팅 (<strong>/<em>/<code>) 의 폭 차이를 모르고 wrap 을 underestimate. inline 포맷팅 element split 비활성화로 conservative fallback 적용. 동일 패턴이 재발하면 확인할 코드 경로와 진단 절차 정리.
---

# 페이지네이션 overflow — pretext 의 inline 포맷팅 폭 underestimate

## 1. Executive Summary

뷰어의 paper-page 가 페이지마다 콘텐츠 영역 (여백 안쪽) 을 5~52 px 초과해 텍스트를 렌더링하는 회귀가 있었다. 근본 원인은 `@chenglou/pretext` 어댑터가 element 의 `textContent` (markup 이 제거된 plain text) 와 *단일* font shorthand 만으로 line wrap 위치를 측정한다는 점이다. `<strong>`, `<em>`, `<code>` 같은 inline 포맷팅이 들어 있으면 실제 렌더 시 그 부분이 굵거나 다른 font family 로 더 넓게 그려지지만 pretext 는 그 차이를 모른다. 결과로 line wrap 위치가 plain-text 기준으로 너무 늦은 char index 에 잡히고, 알고리즘은 한 line 분량 (`lineHeight ≈ 27.2 px`) 만 누적했지만 실제 렌더는 2 line (54 px) 으로 펼쳐지는 케이스가 발생한다.

이 회귀는 같은 세션에서 추가한 "콘텐츠 영역 표시" 토글 (`body[data-content-bounds='on'] .paper-page::before` 가 ┌ ┐ └ ┘ 가이드를 그림) 이 처음 시각적으로 드러내 줬다. 그 전까지는 paper-page 의 `overflow: hidden` 이 padding-bottom 영역 안쪽으로 흘러넘친 텍스트를 가려 주고 있었다.

이번 세션에서 처리한 fix:
- **P1**: `<ul>` / `<ol>` container 자체의 `marginTop` / `marginBottom` 이 line stream 측정에 반영되지 않던 누락. 첫/마지막 `<li>` line 의 marginTop/marginBottom 에 collapse 규칙 (`max-or-sum`) 으로 합쳐 흘려보냄. 일부 페이지에서 5~30 px 개선.
- **P2**: inline 포맷팅 (`<strong>`, `<em>`, `<b>`, `<i>`, `<code>`) 이 들어 있는 inline-splittable element 는 split 비활성화. `offsetHeight` 단위 1 line 으로 처리. mid-text split 정확도 일시 포기, conservative 우선.

결과:
- 모든 페이지가 콘텐츠 영역 안쪽으로 들어옴 (overflow ≤ 0).
- welcome 본문 기준 페이지 수 9 → 10 (1 페이지 증가, packing 효율 약간 감소).
- 90/90 tests + typecheck 통과.

## 2. Background

### 2.1 페이지네이션 흐름 (요약)

`viewer/src/lib/paginate.ts:computeLayout` 가 진입점. 핵심 단계:

1. `computePageFit(settings, layout)` 가 `pageHeight`, `padTop / padBottom / padLeft / padRight` 를 결정. `innerHeight = pageHeight - padTop - padBottom`, `innerWidth = pageWidth - padLeft - padRight`.
2. `buildLineStream(children, { innerWidthPx, innerHeightPx }, measurer)` 가 markdown 의 top-level children 을 `Line[]` 으로 변환. 각 Line 은 `source` element, char range, height, marginTop, marginBottom, splittable 여부, breakAfterAvoid 플래그를 가진다. `viewer/src/lib/lineStream.ts`.
3. `splitByLineHeight(lines, innerHeightPx)` 가 Line[] 을 페이지 그룹 `Line[][]` 로 자른다. 각 그룹의 누적 높이는 `measureLineGroupHeight` 가 산출 — line.height 누적 + same-source 면 height 만, source 가 바뀌면 `collapseVerticalMargins(prev.marginBottom, next.marginTop)` 추가, 마지막에 `+ pendingBottom`.
4. `groupLinesBySource(group)` 가 그룹 안에서 같은 source 의 line 들을 `SourceGroup` 으로 묶는다.
5. `PaperPage` 컴포넌트가 SourceGroup 별로 DOM 을 재생성. splittable + char range 가 유효하면 `extractCharRange(source, startChar, endChar)` 로 해당 char 구간만 추출, 그 외에는 `cloneNode(true)`.

### 2.2 측정의 정확성 가정

`measureLineGroupHeight` 의 결과가 실제 렌더 높이와 **같다** 는 가정 위에서 `splitByLineHeight` 가 각 페이지를 `≤ innerHeight` 로 자른다. 이 가정이 깨지면 페이지가 콘텐츠 영역을 넘는다.

가정이 깨지는 두 종류의 갭:
- **수직 마진 갭**: block 사이 collapse 규칙이 알고리즘과 실제 렌더 사이에 어긋날 때.
- **line 폭 갭**: inline-splittable element (`<p>`, `<li>`) 안의 텍스트 wrap 위치를 pretext 가 잘못 잡을 때.

이 postmortem 의 root cause 는 후자.

### 2.3 pretext 어댑터의 동작

`viewer/src/lib/paragraphSplit.ts:createPretextMeasurer` 의 핵심 호출:

```ts
const font = buildFontShorthand(style)
const prepared = prepareWithSegments(text, font, {
  whiteSpace: ...,
  wordBreak: ...,
  letterSpacing: ...,
})
const lineTexts = []
walkLineRanges(prepared, widthPx, (line) => {
  lineTexts.push(materializeLineRange(prepared, line).text)
})
const lines = mapLineTextsToRanges(text, lineTexts)
return { lineHeight: style.lineHeight, lines }
```

여기서 `text` 는 `child.textContent` (markup 제거된 plain string), `style` 은 `child` 의 computed style (=  base font: family/size/weight/style 하나). `<strong>` 같은 자식 element 의 다른 font weight 는 input 에 들어가지 않는다.

## 3. Symptom

`viewer/public/content/welcome/index.md` 를 약 10 페이지 분량으로 확장한 뒤 Two Pages / Auto / 1920×1080 viewport 에서 다음 overflow 가 측정됐다 (모서리 표시 토글 켠 상태):

| 페이지 | 마지막 element bottom | overflow vs contentBottom (807 px) |
|---|---|---|
| 0 | 995 | +24 px |
| 1 | 995 | +24 px |
| 2 | 1011 | +40 px |
| 3 | 977 | +5 px |
| 4 | 1024 | +52 px |
| 5 | 936 | -34 (정상 underflow) |
| 6 | 980 | +8 px |
| 7 | (계속) | + |

P1 fix (ul/ol container margin) 적용 후 일부 페이지는 개선됐지만 페이지 0/1/2/4/6 은 여전히 +20~40 px overflow.

시각적으로는 paper-page 의 마지막 line 이 콘텐츠 영역 boundary (모서리 표시 토글의 └ ┘) 아래쪽 padding-bottom 영역에 흘러넘쳐 보인다. paper-page 의 `overflow: hidden` 이 padding-bottom 안쪽까지는 클리핑하지 않으므로 (clip 은 padding box 의 가장자리 = border 안쪽), padding 영역에 들어선 텍스트는 그대로 보인다.

## 4. Diagnosis

### 4.1 모서리 토글이 회귀를 드러낸 경위

콘텐츠 영역 모서리 표시 토글 (`body[data-content-bounds='on'] .paper-page::before`) 은 `var(--page-margin-*)` mm 변수로 inset 잡고 8 linear-gradient 로 4 L 모서리를 그린다. inset 이 inline px padding (`mmToPx`, 96 DPI) 과 정확히 매칭되므로 모서리는 콘텐츠 영역 boundary 와 일치한다.

이 가이드를 켠 직후 사용자가 텍스트가 가이드 아래쪽으로 흘러 내려가 있는 것을 즉시 발견. 이전에는 paper-page 의 padding-bottom 영역이 시각적으로 콘텐츠 영역과 분리되지 않아 overflow 가 가려져 있었다.

### 4.2 측정 vs 실제 렌더 비교

Playwright 로 모든 paper-page 의 자식 element 의 `getBoundingClientRect()` 를 수집하고 contentTop / contentBottom (= paper-page rect ± border ± padding) 과 비교했다. 페이지 0 의 last child 는 `<ul>` (height=54, top=776, bottom=831). contentBottom=807 → overflow 24 px.

이 ul 의 내부 li 는 `**로컬 우선**: 원본은 항상 로컬 vault. ...` 텍스트를 갖고 있고 시각적으로 2 line wrap. 페이지 1 첫 child 는 동일 ul 의 continuation 으로 `원본은 손상되지 않습니다.` 가 시작 — 즉 페이지 0 의 li 는 *원본 텍스트의 일부* 만 chars [0, X] 로 추출되어 렌더된 상태이고, 그 추출된 chars 가 visible 에서 2 line 으로 wrap 되어 표시된 것.

이때 알고리즘은 li 에 대해 pretext 가 반환한 line 1 만 페이지 0 에 할당했다고 가정한다. line 1 의 `height = measured.lineHeight = 27.2 px`. 페이지 0 의 누적은 그 27.2 px 만 받았다. 그러나 실제 렌더된 chars [0, X] 는 2 line × 27.2 = 54.4 px 차지. 갭 = 27 px. observed overflow ~24 px 와 일치.

### 4.3 root cause 확정

`createPretextMeasurer` 가 받는 `text` 와 `style`:
- `text = child.textContent` — `<strong>` / `<em>` / `<code>` markup 이 빠진 plain string
- `style` — `child` 의 base computed style (family / size / weight / style 하나)

`<strong>` 안에 있는 `로컬 우선` 은 실제 렌더 시 `font-weight: bold` 가 적용되어 폭이 더 넓다. 하지만 pretext 는 plain text + base weight 로만 측정 → wrap 위치가 plain-text 기준 (더 넓은 char range) 으로 잡힘 → measured 의 line 1 은 실제로는 2 line 분량의 chars 를 담고 있음.

요약:
- `pretext.lineCount` < `actual_line_count` (under-count)
- `algorithm.height_per_line` × `pretext.lineCount` < `actual_offsetHeight`
- `splitByLineHeight` 는 algorithm 의 작은 합에 기반해 페이지 자르므로 실제는 콘텐츠 영역을 넘어선다.

## 5. Fix

### 5.1 P1 — list container margin 보정 (`viewer/src/lib/lineStream.ts`)

`buildLineStream` 이 `<ul>` / `<ol>` 컨테이너를 만나면 자식 `<li>` 로 바로 재귀하면서 컨테이너 자체의 `marginTop` / `marginBottom` 을 line stream 에 누적하지 않던 결함. CSS 부모-자식 마진 collapse 규칙과 동일한 max-or-sum (`collapseVerticalMargins`) 으로 컨테이너의 margin 을 첫 / 마지막 `<li>` line 의 marginTop / marginBottom 에 합쳐 흘려보낸다.

```ts
if (isListContainer(child)) {
  const liChildren = Array.from(child.children) as HTMLElement[]
  const liLines = buildLineStream(liChildren, metrics, measurer)
  if (liLines.length > 0) {
    const first = liLines[0]!
    const last = liLines[liLines.length - 1]!
    first.marginTop = collapseVerticalMargins(first.marginTop, margins.marginTop)
    last.marginBottom = collapseVerticalMargins(last.marginBottom, margins.marginBottom)
  }
  out.push(...liLines)
  continue
}
```

이 fix 만으로는 페이지 4 가 +52 → +26 정도까지만 개선되어 잔여 overflow 가 남았다.

### 5.2 P2 — inline 포맷팅 element 의 split 비활성 (`viewer/src/lib/lineStream.ts`)

`isInlineSplittable(child)` (= `<p>` 또는 `<li>`) 분기에서 short-paragraph 분기 직후, measurer 호출 전에 inline 포맷팅 자식을 검사:

```ts
if (child.querySelector('strong, em, b, i, code')) {
  out.push({
    source: child,
    charStart: -1,
    charEnd: -1,
    height: child.offsetHeight,
    marginTop: margins.marginTop,
    marginBottom: margins.marginBottom,
    splittable: false,
    breakAfterAvoid: false,
    kind: baseKind,
  })
  continue
}
```

이 분기에 들어가면 element 는 단일 unit 으로 처리. mid-text split 안 함, height = 실제 `offsetHeight`.

Trade-off:
- 큰 단락이 통째로 다음 페이지로 밀릴 수 있어 packing 효율 약간 감소 (welcome 본문 9 → 10 페이지).
- 콘텐츠 영역 침범은 0 으로 해소.

## 6. Verification

- viewer `npm test`: 12 files / 90 tests 통과.
- viewer `npm run typecheck`: 통과.
- Playwright Two Pages / Auto / 1920×1080: 모든 페이지 last child bottom ≤ contentBottom 확인 (overflow 음수 = under-fill).

| 페이지 | overflow before fix | overflow after both fixes |
|---|---|---|
| 0 | +24 | -47 |
| 1 | +24 | -113 |
| 2 | +40 | -29 |
| 3 | +5 | -96 |
| 4 | +52 | -74 |
| 5 | -34 | -115 |
| 6 | +8 | -119 |
| 7 | n/a | -24 |
| 8 | n/a | -57 |
| 9 (마지막) | n/a | -368 |

## 7. Historical Context — 페이지네이션 / 측정 관련 과거 회귀 모음

본 절은 git log 의 페이지네이션·측정·여백 관련 commit 을 시간 순으로 정리. 같은 패턴이 *다른 형태로* 다섯 번 이상 재발했음. 신규 회귀가 발생했을 때 이 표에서 가장 비슷한 과거 케이스를 먼저 찾으면 진단 시간이 단축된다.

### 7.1 시간 순 회귀·fix 카탈로그

| 태그 | commit | 무엇이 바뀜 / 무엇이 깨짐 |
|---|---|---|
| v0.1.19 | `084022d` | 최초 도입: Layout 4 종 + page size 4 종 + margin 4 방향 + page indicator |
| v0.1.20 | `a46cef5` | Horizontal layout — 종이 분리 + wheel/keydown/snap 페이지 단위 |
| v0.1.21 | `a9602cf` | Vertical 진짜 paper-page 분리 + 헤더 제목 + centering |
| v0.1.22 | `1b22fd4` | Horizontal/Two Pages 도 paper-page + **viewport-fit** + virtual page-flip. mm → px 변환 시 같은 scale 로 padding 도 곱하기 시작 (이 결정이 v0.2.2 에서 회귀로 드러남) |
| v0.1.50 | `79a982b` | `@chenglou/pretext` 도입. paragraphSplit + expandLargeParagraphs — 단락 내부 char 단위 분할. vertical/horizontal/two-pages 세 모드 단락 overflow 일차 해결 |
| v0.1.52 | `0d860ff` | line-단위 paginate 재설계 — `buildLineStream` / `splitByLineHeight` / `renderLineGroups` 3 단계. 짧은 단락 measurer skip (`offsetHeight ≤ lineHeight × SHORT_PARAGRAPH_RATIO`). measurer throw 시 element 단위 1 line fallback. heading orphan 가드. |
| v0.1.59 | `de142c4` | Zustand paginate state 통합. EntryView 가 imperative DOM 조작 X, *off-screen measure container* 에서 측정 → store dispatch → `PaginatedView` 가 store 기반 visible JSX 렌더 |
| v0.1.60 | `3bc7cc5` | **v0.1.59 회귀 fix**: window resize listener 가 함께 사라져 viewport 변경에 무반응. `viewportTick` state + debounce 200 ms listener 복원 |
| v0.1.61 | `9546d53` | **v0.1.59 회귀 fix**: `PaginatedView` 가 `<article>` 직접 자식으로 paper-page 들을 mount 하면서 `.entry-content` wrapper 가 사라짐. `body[data-layout='vertical'] .entry-content { display:flex; align-items:center; gap:1rem }` CSS 가 미적용되어 vertical 정렬 + 페이지 사이 간격 깨짐 |
| v0.1.62 | `2f901dc` | 성능 fix: `EntryView.renderKey` 가 모든 settings dep → settings 변경마다 MarkdownRenderer unmount + 재 parse (50ms+). renderKey 를 `[targetHash, renderToken]` 로 축소. `markdownRootRef` + `markdownTick` 으로 재측정 트리거 분리 |
| v0.1.63 | `34d251a` | **codex 리뷰 4 건 fix**: (a) measurement DOM 의 ancestry 가 visible 과 달라 CSS direct-child 매칭 실패 — `MarkdownRenderer` 에 `as`/`className`/`style` props 추가해 measurement 도 `.entry-content > .paper-page` 또는 `.entry-content > .page-strip > .paper-page` 로 정렬. (b) fixed vertical 측정 시 viewport-fit 강제 적용 제거. (c) `PaperPage` fit=null 전환 시 inline width/height/padding 명시적 cleanup. (d) strip total≤0 일 때 indicator visible:false. 회귀 테스트 4 건 추가. postmortem: `docs/postmortems/2026-04-28-viewer-pagination-review-fix.md` |
| v0.2.0 | (reset, code 변경 없음) | listing index 사고 후 v0.1.x 전체 reset |
| v0.2.1 | `08d9901` | **회귀 fix**: `splitByLineHeight` 가 line height/`offsetHeight` 만 누적하고 `<p>`/heading 의 vertical margin (margin-top + margin-bottom + collapse) 을 빼먹어 첫 페이지가 실 DOM 보다 작게 계산됨. `Line` type 에 marginTop/marginBottom 추가. `readBlockMargins` + `collapseVerticalMargins` (CSS adjoining margin spec) + `measureLineGroupHeight` 도입. bug-report: `docs/bug-reports/2026-04-28-pretext-pagination-still-overflowing.md` |
| v0.2.2 | `00e40e4` | **회귀 fix**: `computePageFit` 이 viewport-fit 으로 pageHeight 줄인 뒤 `scale = pageHeight / mmToPx(dims.h)` 를 padding 에도 곱해 같은 marginTop=20mm 가 Auto/B4/A4/B5/A5 마다 다른 px (~46~76 px). scale 곱 제거. dead hook `usePageSizeCss` (사용 안 되는 `--page-width-mm` 류 변수) 제거. bug-report: `docs/bug-reports/2026-04-28-pagesize-margin-divergence.md` |
| v0.2.3 | `0def9de` | UX: 여백 number input spinner 디자인 (측정 무관) |
| 현재 | `562317f` | **회귀 fix (오늘 P1)**: `<ul>` / `<ol>` container 자체의 marginTop / marginBottom 이 line stream 에 누락. 첫/마지막 `<li>` line 의 margin 에 collapse 규칙으로 합쳐 흘려보냄. |
| 현재 | `eeb8056` | **회귀 fix (오늘 P2 — 본 postmortem)**: pretext 가 inline 포맷팅 (`<strong>`/`<em>`/`<code>`) 의 폭 차이 모름 → wrap 위치 underestimate. inline 포맷팅 자식 있으면 split 비활성, offsetHeight 단위 1 line 처리 |

### 7.2 회귀 패턴 5 분류

위 카탈로그를 패턴별로 묶으면 다음 5 가지로 수렴한다. 신규 회귀가 발생하면 어느 분류인지 먼저 짚어야 한다.

#### 분류 A — Block margin 누락
- **사례**: v0.2.1 (vertical block margin 0 으로 계산), v0.2.2 (scale 곱), 562317f (ul/ol container margin)
- **증상**: 페이지마다 일정한 px (보통 12~20 px) overflow 또는 페이지 사이 간격이 시각적으로 어긋남
- **확인 위치**: `viewer/src/lib/lineStream.ts` 의 `measureLineGroupHeight`, `collapseVerticalMargins`, `readBlockMargins`. container 분기 (`isListContainer`).
- **원인 후보**: 새로 도입한 element 종류의 margin 이 line stream 에 흘러들지 않음. CSS adjoining margin spec 처리 누락.

#### 분류 B — Width/line-count 측정 inaccuracy
- **사례**: v0.2.2 (padding scale), eeb8056 (inline 포맷팅 폭)
- **증상**: 페이지마다 다른 크기의 overflow (5~50 px), pageSize 마다 결과가 다름
- **확인 위치**: `viewer/src/lib/paragraphSplit.ts` 의 `createPretextMeasurer`, `viewer/src/lib/paginate.ts` 의 `computePageFit`
- **원인 후보**: 측정 input (text/style/width) 이 실제 렌더 환경과 다름. inline 포맷팅의 폭 차이를 모름. mm → px 변환에 잘못된 factor 적용.

#### 분류 C — 측정 DOM ↔ visible DOM 구조 불일치
- **사례**: v0.1.63 (ancestry 차이), v0.1.61 (`.entry-content` wrapper 누락)
- **증상**: vertical 정렬 / 페이지 간격 / direct-child CSS 가 적용되지 않음. `offsetHeight` 가 의도와 다름
- **확인 위치**: `viewer/src/components/pages/EntryView.tsx` 의 `measureMarkdown`, `viewer/src/components/pagination/PaginatedView.tsx`
- **원인 후보**: refactor 중 measure 또는 visible 한쪽의 DOM 구조가 살짝 바뀌고 다른 쪽이 안 따라감. CSS direct-child selector 가 매칭 실패.

#### 분류 D — Refactor 회귀 (사라진 기능)
- **사례**: v0.1.60 (resize listener), v0.1.61 (entry-content wrapper)
- **증상**: 특정 사용자 액션 (resize / settings 변경) 후 paper-page 가 갱신 안 됨
- **확인 위치**: `viewer/src/components/pages/EntryView.tsx` 의 `useEffect` 들 (viewport resize / markdown ready / settings 변경 dep). store dispatch.
- **원인 후보**: refactor 중 hook / listener / state slice 가 폐기되면서 의존하던 부수 효과도 함께 사라짐.

#### 분류 E — 성능 (재처리 비효율)
- **사례**: v0.1.62 (settings 변경 시 markdown 재 parse)
- **증상**: 사용자 조작 시 시각적으로 "다시 그려지는" 느낌, 50ms+ 지연
- **확인 위치**: `EntryView` 의 `renderKey` deps, `MarkdownRenderer` 의 unmount/remount 트리거
- **원인 후보**: settings dep 가 너무 넓어 markdown parse 까지 매번 다시 함. measurement 만 다시 해야 하는데 markdown 도 재처리.

### 7.3 첫-look 진단 체크리스트

신규 페이지네이션·측정 회귀가 발생하면 이 순서로 확인:

1. **시각 확인**: 모서리 표시 토글 ON. ┌ ┐ └ ┘ 가이드 안에 텍스트가 들어가는가? (분류 A/B/C 모두)
2. **모든 페이지 정량화**: Playwright 로 paper-page 별 last child bottom vs contentBottom 차이 측정 (§ 7.4 스크립트).
3. **분류 좁히기**:
   - 모든 페이지에서 *일정한* overflow → 분류 A (block margin 누락)
   - 페이지마다 *다른 크기* overflow → 분류 B (측정 inaccuracy)
   - 정렬/간격이 깨짐 (overflow 와 별개) → 분류 C (DOM 구조 불일치)
   - 사용자 조작 후 paper-page 가 갱신 안 됨 → 분류 D (refactor 회귀)
   - 시각은 멀쩡한데 느림 → 분류 E (재처리 비효율)
4. **분류별 우선 확인 위치** (§ 7.2 의 "확인 위치") 부터 코드 검사.
5. **과거 유사 fix 확인**: § 7.1 에서 가장 비슷한 commit 의 diff 를 git log 로 살펴 동일 패턴인지 비교.

### 7.4 동일 패턴이 재발했을 때의 진단 절차

#### 단계 1 — 시각 확인

뷰어 ⚙ → Vertical Scroll / Horizontal / Two Pages 중 하나 선택 → "콘텐츠 영역 표시" 토글 ON. ┌ ┐ └ ┘ 가이드보다 아래쪽으로 텍스트가 흘러나오는 페이지가 있으면 overflow.

#### 단계 2 — Playwright 로 정량화

`.agents/skills/notedrop-viewer-playwright-check` skill 로 다음 형태의 스크립트를 돌려 paper-page 별 overflow 확인:

```js
await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('.entry-content:not([aria-hidden]) .paper-page'))
  return all.map((el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const padTop = parseFloat(cs.paddingTop)
    const padBottom = parseFloat(cs.paddingBottom)
    const border = parseFloat(cs.borderTopWidth) || 0
    const contentBottom = r.bottom - border - padBottom
    let maxBottom = 0
    for (const c of el.children) {
      const cr = c.getBoundingClientRect()
      if (cr.bottom > maxBottom) maxBottom = cr.bottom
    }
    return Math.round(maxBottom - contentBottom)
  })
})
```

양수가 나오면 그 페이지는 overflow.

#### 단계 3 — 알고리즘 측정 vs 실제 렌더 비교

overflow 가 발생한 페이지의 last child 의 `tag`, `offsetHeight`, computed `marginTop` / `marginBottom` 을 확인. 그리고 알고리즘이 그 element 에 부여한 line height 추정:

- **tag 가 `<p>` / `<li>` 인데 자식에 `<strong>` / `<em>` / `<code>` / `<b>` / `<i>` 가 있는 경우**: 본 postmortem 의 케이스. 현재 fix 가 split 비활성으로 막고 있지만 측정기를 segmented 로 개선하면 이 분기를 줄일 수 있다 (§ 7.6).
- **tag 가 `<ul>` / `<ol>` / `<blockquote>` / 기타 container 인데 페이지 시작/끝 부근에서 갭이 다른 경우**: container 의 margin 누락이 원인일 수 있음. `viewer/src/lib/lineStream.ts:170-191` 의 list container 처리를 다른 container 종류 (`<blockquote>` 등) 에도 확장 필요.
- **모든 element 가 plain text 인데도 overflow**: `mmToPx` (96 DPI) 변환과 브라우저의 mm 변환이 어긋났거나, paper-page 의 inline padding 이 CSS 변수와 다를 가능성. `viewer/src/lib/paginate.ts:104-107` 의 padTop/padBottom/padLeft/padRight 계산을 다시 확인.

### 7.5 핵심 코드 경로 맵

| 책임 | 파일 / 함수 |
|---|---|
| 페이지 fit (width / height / padding) 계산 | `viewer/src/lib/paginate.ts:computePageFit` |
| 페이지 layout 진입 | `viewer/src/lib/paginate.ts:computeLayout` |
| Line stream 빌드 (element → Line[]) | `viewer/src/lib/lineStream.ts:buildLineStream` |
| Container margin 합산 | `viewer/src/lib/lineStream.ts:170-191` (`isListContainer` 분기) |
| Inline 포맷팅 fallback | `viewer/src/lib/lineStream.ts:240-254` (`querySelector('strong, em, b, i, code')`) |
| Line group 높이 누적 / 마진 collapse | `viewer/src/lib/lineStream.ts:measureLineGroupHeight`, `collapseVerticalMargins` |
| 페이지 자르기 | `viewer/src/lib/lineStream.ts:splitByLineHeight` |
| pretext 어댑터 | `viewer/src/lib/paragraphSplit.ts:createPretextMeasurer` |
| 측정 DOM | `viewer/src/components/pages/EntryView.tsx:measureMarkdown` |
| 시각 확인용 가이드 | `viewer/src/app/globals.css` 의 `body[data-content-bounds='on'] .paper-page::before` |

### 7.6 후속 audit / 개선 후보

- **A. pretext 측정기를 segmented 로 개선**: `prepareWithSegments` 가 받는 `text` 를 단일 string 대신 `{ text, font }[]` segmented 입력으로 바꿔서 inline 포맷팅의 폭을 정확히 반영. inline 포맷팅 fallback (split 비활성) 을 다시 풀 수 있게 됨. `viewer/src/lib/paragraphSplit.ts:createPretextMeasurer` 와 `lineStream.ts` 의 measure 호출부를 한 번에 수정.
- **B. `<blockquote>` container margin 케이스 점검**: 현재 fix 는 `<ul>` / `<ol>` 에만 적용. blockquote 는 `unit element` 분기로 처리되어 일단 안전하지만, 만약 `<blockquote>` 안에 splittable 자식을 둘 미래 변경이 들어오면 동일 패턴 회귀 가능. `isListContainer` 가 검사하는 tag 목록과 unit 분기 목록을 의도적으로 검토.
- **C. 회귀 자동 테스트**: Playwright 기반 "모든 paper-page 의 lastChild.bottom ≤ contentBottom + ε" assertion 을 회귀 테스트로 추가. 본 케이스처럼 paginate 가 over-fitting 을 만들 때 CI 에서 잡힘. `notedrop-viewer-playwright-check` skill 흐름을 그대로 사용.
- **D. 콘텐츠 영역 모서리 표시 토글의 default**: 현재 default = false (off). 회귀 검증 빈도를 높이려면 dev/test 환경에서만 default = true 로 바꾸는 것도 옵션이지만, `applyViewSettings` 가 ENV 분기를 두는 것은 view 계층의 책임 경계 밖이라 권장하지 않음. 대신 (C) 자동 테스트에 의지.

### 7.7 주의 — 잘못된 진단으로 빠지기 쉬운 곳

- "모서리가 잘못 그려졌다": ┌ ┐ └ ┘ 의 inset 은 `var(--page-margin-*)` mm 변수와 inline px padding 이 같은 96 DPI 변환을 거치므로 이 둘이 어긋날 가능성은 거의 없다. 모서리가 텍스트 위/아래로 어긋나 보이면 일단 텍스트 (= paginate 결과) 쪽을 의심.
- "li 의 margin 을 직접 수정": `<li>` 의 default margin 은 4 px 로 작고 `<ul>` / `<ol>` 의 margin 16 px 가 실질적인 갭을 만든다. li margin 만 만지면 의도와 다른 곳에서 회귀 발생.
- "`<p>` 안에 `<strong>` 이 없는데도 overflow": 그 페이지의 *다른* element 에서 누적된 갭이 마지막 element 까지 밀린 것일 수 있다. last element 만 보지 말고 페이지 전체의 element 별 top/bottom 을 확인.

## 8. Open Issues

- **Inline 포맷팅 element 의 mid-text split 일시 포기**: 큰 `<p>` 가 통째로 다음 페이지에 밀려 paper-page 끝부분에 빈 공간이 길어질 수 있음. 후속 §7.6 (A) 로 복원.
- **잔여 마진 갭 audit 필요**: `<blockquote>` 등 다른 container 의 margin 처리 점검은 후속 작업.
- **콘텐츠 영역 모서리 표시 토글의 a11y**: 현재 단순 시각 가이드이므로 스크린 리더에 별도 정보 노출 안 함. 의도된 디자인.

## 9. References

### 본 세션 commit

- `eeb8056` 🐛 fix(viewer): pagination overflow — inline 포맷팅 (`<strong>`/`<em>`/`<code>`) 들어간 단락 split 비활성
- `562317f` 🐛 fix(viewer): pagination — `<ul>`/`<ol>` container margin 측정 누락 보정
- `7cded34` ✨ feat(viewer): 콘텐츠 영역 모서리 표시 토글

### 과거 페이지네이션·측정 commit (§ 7.1 카탈로그 참고)

- `084022d` (v0.1.19) Layout/page size/margin 최초 도입
- `1b22fd4` (v0.1.22) Horizontal/Two Pages paper-page + viewport-fit
- `79a982b` (v0.1.50) `@chenglou/pretext` 도입 + 단락 char 단위 분할
- `0d860ff` (v0.1.52) line-단위 paginate 재설계
- `de142c4` (v0.1.59) Zustand paginate state 통합
- `3bc7cc5` (v0.1.60) v0.1.59 회귀: window resize listener 복원
- `9546d53` (v0.1.61) v0.1.59 회귀: `.entry-content` wrapper 복원
- `2f901dc` (v0.1.62) settings 변경 시 markdown 재처리 회피
- `34d251a` (v0.1.63) measurement DOM ↔ visible DOM 동기화 (codex 리뷰)
- `08d9901` (v0.2.1) vertical margin 누락 fix (block margin collapse)
- `00e40e4` (v0.2.2) pageSize 별 margin scale 곱하기 제거 + dead hook 제거

### 관련 spec / postmortem / bug-report

- spec: `docs/superpowers/specs/2026-04-27-pretext-paragraph-pagination-design.md` (pretext 도입 설계)
- spec: `docs/superpowers/specs/2026-04-27-line-by-line-paginate-design.md` (line 단위 알고리즘 설계)
- postmortem: `docs/postmortems/2026-04-28-viewer-pagination-review-fix.md` (v0.1.63 measurement DOM 동기화 fix 의 상세 분석)
- bug-report: `docs/bug-reports/2026-04-28-pretext-pagination-still-overflowing.md` (v0.2.1 의 vertical margin 누락 진단 보고)
- bug-report: `docs/bug-reports/2026-04-28-pagesize-margin-divergence.md` (v0.2.2 의 pageSize × margin 불일치 진단 + 코드 경로 맵)
- handoff: `docs/superpowers/handoffs/2026-04-27-pretext-pagination-completion.md`
- handoff: `docs/superpowers/handoffs/2026-04-27-line-by-line-paginate-completion.md`
