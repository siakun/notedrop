---
date: 2026-04-28
type: 버그 리포트 (codex 의뢰용)
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - viewer
  - pagination
  - pretext
  - overflow
  - bug
summary: chenglou/pretext 도입 (v0.1.50) + line-단위 재설계 (v0.1.52) + measurement DOM 동기화 (v0.1.63) 까지 진행했음에도, vertical Auto / horizontal / two-pages 에서 첫 paper-page 에 콘텐츠가 패킹돼 page bottom 을 넘어 overflow 하는 회귀가 잔존. pretext measurer 가 보고하는 wrap line 수가 실제 browser 렌더 line 수보다 적어 splitByLineHeight 누적치가 underestimate 되는 것이 가장 유력. codex 에게 root cause 분석 + fix + 회귀 테스트 의뢰.
related:
  - viewer/src/lib/lineStream.ts
  - viewer/src/lib/paragraphSplit.ts
  - viewer/src/lib/paginate.ts
  - viewer/src/components/pages/EntryView.tsx
  - viewer/src/components/pagination/PaperPage.tsx
  - docs/superpowers/specs/2026-04-27-pretext-paragraph-pagination-design.md
  - docs/superpowers/specs/2026-04-27-line-by-line-paginate-design.md
  - docs/superpowers/handoffs/2026-04-27-pretext-pagination-completion.md
  - docs/superpowers/handoffs/2026-04-27-line-by-line-paginate-completion.md
  - docs/postmortems/2026-04-28-viewer-pagination-review-fix.md
---

# pretext 도입 후에도 첫 paper-page overflow 가 잔존 — codex fix + 코드리뷰 의뢰

## 0. TL;DR

- **증상**: vertical Auto / horizontal / two-pages 모드에서 첫 paper-page 의 콘텐츠가 page bottom 박스 밖으로 흘러내림. 두 번째 이후 페이지는 표시되지만 첫 페이지가 *과적*.
- **가설 (가장 유력)**: `createPretextMeasurer` 가 반환하는 wrap line 수가 실제 browser 가 그리는 line 수보다 *적게* 나와서 `buildLineStream` 단계에서 단락 height 가 underestimate → `splitByLineHeight` 가 첫 그룹에 너무 많은 line 을 묶음. height 누적이 innerHeightPx 안에 "들어간다고" 판단하지만 실제 layout 은 더 큼.
- **이미 처리된 인접 회귀** (이 버그 와 *다른* 문제):
  - v0.1.50 ─ pretext 어댑터 + `expandLargeParagraphs` 도입
  - v0.1.52 ─ element 단위 → line 단위 재설계 (`buildLineStream`/`splitByLineHeight`/`renderLineGroups`)
  - v0.1.63 ─ measurement DOM ↔ visible DOM 구조 동기화 (`.entry-content > .paper-page` ancestry 일치)
- **재현 환경 (이미지)**: layout=Horizontal Scroll, pageSize=Auto, marginTop/Bottom=20mm, marginLeft/Right=25mm, viewport ~ 1536×961 (개발자도구 패널 열린 상태). 콘텐츠는 Korean 5단락 + h1 + h2.

## 1. 증상 (스크린샷 분석)

### 1.1 visible DOM 상태 (DevTools 패널 기준)

```
<div class="page-strip" style="transform: translate(-368.50px, -50%);">
  <section class="paper-page" style="width:731.818px; height:1035px; padding:69.697px 87.1212px;">
    <h1>자기소개서 — .NET 백엔드</h1>
    <h2>성장과정</h2>
    <p>대학 시절 …</p>            ← 5 줄 wrap
    <p>2023년 8월 …</p>           ← 6 줄 wrap
    <p>입사 약 1년이 …</p>        ← 7 줄 wrap
    <p>같은 프로젝트에서 …</p>    ← 7 줄 wrap
    <p>이후 자연스럽게 …</p>      ← 7 줄 wrap (BOX 밖으로 overflow)
  </section>
  <section class="paper-page">…</section>   ← 정상 분리됨
  <section class="paper-page">…</section>
  …
</div>
```

### 1.2 측정값

- 페이지 outer: 731.818 × 1035 px
- padding: top/bottom 69.697 px, left/right 87.1212 px
- inner box: **inner W ≈ 557.58 px / inner H ≈ 895.6 px**
  - viewport-fit Auto, scale = 1035 / mmToPx(297) ≈ 0.922
  - padTop = mmToPx(20) × 0.922 ≈ 69.69 px ✓
  - padLeft = mmToPx(25) × 0.922 ≈ 87.12 px ✓
- entry-content `font-size = 16 × user-font-scale` (scale = 1)
- entry-content `line-height = 1.7 × user-line-scale` (unitless multiplier)
- 따라서 한 줄 line-height ≈ **27.2 px** → 페이지당 최대 ≈ 32 줄 (`floor(895.6 / 27.2)`)

### 1.3 패킹 결과 (육안)

첫 페이지에 들어간 라인 수 (brief estimate):
- h1 1줄 (font-size 2em, line-height 1.3) ≈ 41.6 px
- h2 1줄 (1.5em × 1.3) ≈ 31.2 px
- 5 단락 wrap 라인 수 ≈ 5+6+7+7+7 = 32 줄 × 27.2 ≈ 870.4 px
- 합산 ≈ 943 px → innerHeight 895.6 px **를 ~47 px (≈ 1.7 줄) 초과** = overflow 폭 일치.

이 1.7 줄 격차는 *측정 단계에서 wrap line 1~2 개가 누락*되는 것과 정량적으로 일치.

## 2. 도입 이력 (git log + 핸드오프 문서 교차 검증)

| 시점 | commit | 의도 | 잔류 영향 |
|---|---|---|---|
| spec | `714887a` | "pretext 단락 분할 spec + plan 추가" | 가정 vs 실 API 차이 6.x §6 에 정리됨 |
| dep | `1cf8cac` | "@chenglou/pretext v0.0.6 의존성 추가" | 현 `viewer/package.json` 에 그대로 |
| 신규 모듈 | `3826fa5`, `f0e4797`, `54b1b0c`, `c7c90e1`, `4cb2b49`, `f9cd0a7`, `a118697` | paragraphSplit.ts (어댑터 + DOM split + measurer DI) | element-단위 함수 9 건은 v0.1.52 에서 폐기, 어댑터 + `splitElementAtCharIndex` + `mapLineTextsToRanges` 만 잔존 |
| 통합 | `6e11503`, `0d70c4f` | paginateVertical / paginateStrip 에 `expandLargeParagraphs` 통합 | v0.1.52 에서 통째 교체 |
| 진단 | `5d4d85d` (v0.1.51) | viewer build identity overlay + paragraph split 진단 | 현재 코드에서 `__notedropParagraphDiag` window hook 도 폐기됨 |
| 재설계 | `593dc13`, `ba02ef5`, `a9e0c84`, `24f6ea9`, `1094ee2`, `ceac95f`, `1190904`, `0d860ff` (v0.1.52) | element-단위 → line-단위 (`buildLineStream`/`splitByLineHeight`/`renderLineGroups`) | **현재 알고리즘** |
| Zustand | `c0fb2ed`, `8e6cd51`, `307281b`, `277dae1`, `de142c4` (v0.1.59) | paginate state slice + `PaperPage` / `PaginatedView` 컴포넌트 + `useStripNavigation` hook | 현재 구조 |
| 회귀 fix #1 | `3bc7cc5` (v0.1.60) | EntryView window resize 재 측정 복원 | 잔존 |
| 회귀 fix #2 | `9546d53` (v0.1.61) | PaginatedView `.entry-content` wrapper 복원 | 잔존 |
| 회귀 fix #3 | `2f901dc` (v0.1.62) | settings 변경 시 markdown 재처리 회피 — paginate 만 재실행 | 잔존 (renderKey 분리) |
| **회귀 fix #4** | `34d251a` (v0.1.63) | **measurement DOM 을 visible PaperPage 와 동일 ancestry / direct-child 구조로 정렬 + fixed vertical fit 재적용 제거 + PaperPage fit=null 시 inline cleanup + total<=0 indicator 차단** | 잔존, **하지만 본 버그 미해결** |

핵심: v0.1.63 까지의 패치는 **measurement vs visible DOM 의 *구조* 가 달라서 측정이 빗나가는 회귀**를 잡았음. 이번 잔존 버그는 *동일 구조*에서도 pretext 의 line 보고가 실제 layout 과 다른, *수치/알고리즘* 차원의 회귀로 보임.

## 3. 현재 파이프라인 (실제 코드 재구성)

```
EntryView.handleContentReady(measureRoot=section.paper-page)
  → useEffect[settings, viewportTick, markdownTick] 트리거
  → computeLayout(measureRoot, settings, layout)
      ├─ flat = Array.from(measureRoot.children) as HTMLElement[]
      ├─ innerWidthPx, innerHeightPx 계산 (layout, pageSize 별 분기)
      ├─ buildLineStream(flat, {innerWidthPx, innerHeightPx}, createPretextMeasurer())
      │     └─ <p>/<li> 처럼 inline-splittable:
      │         · style = readFontStyle(child)  ← getComputedStyle
      │         · offsetHeight ≤ lineHeight × 1.5 → 1 line (offsetHeight 그대로)
      │         · 그 외 → measurer(text, style, innerWidthPx)
      │              · prepareWithSegments(text, font, {whiteSpace, wordBreak, letterSpacing})
      │              · walkLineRanges(prepared, widthPx, cb)
      │              · materializeLineRange(prepared, line).text → lineTexts[]
      │              · mapLineTextsToRanges(text, lineTexts) → LineRange[]
      │              · return {lineHeight: style.lineHeight, lines}
      │              · 각 LineRange → out.push({height: measured.lineHeight, ...})
      ├─ splitByLineHeight(lineStream, innerHeightPx) → Line[][] (heading orphan 가드 포함)
      └─ pages = lineGroups.map(g => ({sourceGroups: groupLinesBySource(g), layout}))
  → setLayoutResult(pages, fit)
  → PaginatedView 가 store 구독 → PaperPage 들 mount
```

## 4. 가설 — 왜 첫 page 가 overflow 하는가

### 4.1 (가장 유력) pretext 가 보고하는 line 수가 실제 browser wrap line 수보다 *적다*

증거:
- 4.7 단락 wrap line 1~2 개 분량 (약 47 px) 만 누락되어도 첫 페이지가 정확히 화면 박스를 넘는 양과 일치 (§1.3).
- pretext 의 `prepareWithSegments` 은 canvas `measureText` 기반 → DOM/browser 의 실 layout 과 **광폭 (advance/letter-spacing/sub-pixel)** 차이 가능.
- `letterSpacing` 매핑: `paragraphSplit.ts:170` 에서 `parseFloat(cs.letterSpacing) || 0`. CSS 가 `-0.005em` ~ `-0.01em` (h1~h4) / `0.05em` (some) — `<p>` 자체엔 명시 letterSpacing 없으니 'normal' → 0. 그러나 entry-content `font-family` 가 user-font-stack (Korean fallback chain) 이라 canvas 가 사용하는 fallback 폰트와 browser 가 사용하는 fallback 폰트가 다를 가능성 있음.
- `whiteSpace`: `<p>` 는 default `'normal'` → pretext `'normal'`. 일치.
- `wordBreak`: CSS 에 명시 없음 → computed `'normal'` → pretext `'normal'`. pretext 의 `'normal'` mode 는 CJK 를 graheme 단위로 분리 (analysis.ts:271, layout.ts:514 부근 `containsCJK` 분기) → 한글 wrap 자체는 가능. 하지만 *한글 + ASCII 혼합* 단락의 wrap 위치가 browser 와 다를 수 있음.

### 4.2 (가능성 있음) `style.lineHeight` 결정 식이 browser 의 실 line height 와 다름

`paragraphSplit.ts:90-94 (lineStream.ts readFontStyle)`:
```ts
lineHeight: parseFloat(cs.lineHeight) || fontSize * 1.5,
```

- entry-content CSS 는 `line-height: calc(1.7 * var(--user-line-scale))`.
- `getComputedStyle` 은 unitless 를 `<element>.style` 기준으로 px 로 *resolve* 해서 반환. 따라서 `parseFloat(cs.lineHeight)` 는 px 값 (예: 27.2) 반환 — `|| fontSize * 1.5` (24) fallback 안 발동. **이론상 OK**.
- 단, *measurement container* 가 `.entry-content` direct child 라 `--user-font-scale` / `--user-line-scale` CSS variable 이 inherit 됨. **만약 measurement 시점에 variable 이 set 되기 전이라면** `1.7 * 1` 이 아닌 `1.7 * (initial)` 로 계산될 수 있음. `globals.css` 에 root variable default 가 보장되는지 확인 필요.

### 4.3 (가능성 있음) heading 의 lineHeight 가 1.3 인 점이 무시됨

CSS:
```css
.entry-content h1, h2, h3, h4 { line-height: calc(1.3 * var(--user-line-scale)); }
.entry-content h2 { font-size: 1.5em; }
```

- buildLineStream 의 heading branch 는 `child.offsetHeight` 를 그대로 height 로 사용 (lineStream.ts:128~138). **이건 OK** — 실제 렌더 height 그대로.
- 단, h1/h2 는 `margin-top: 2.4rem` (≈ 38.4 px) 도 갖는데 `offsetHeight` 는 margin 미포함. `splitByLineHeight` 가 단순 height 누적만 하므로 **margin 누락분은 모두 underestimate** 가 됨. 첫 element 는 `:first-child` 로 margin-top 0 이지만 두 번째 h2 (성장과정) 부터는 margin-top 발동.

  ```css
  .entry-content h1:first-child,
  .entry-content h2:first-child { margin-top: 0; }
  ```

- 또 `.entry-content p { margin: 0.75em 0; }` ≈ 12 px (16 × 0.75) 위/아래. 두 단락 사이 margin collapse 후 ≈ 12 px 1회. 5 단락 사이 4 collapse → 48 px 누락. **이것만으로 §1.3 격차 (47 px) 와 일치**.
- buildLineStream 의 `<p>` branch:
  - 짧은 단락 (offsetHeight ≤ 1.5 × lineHeight) → height = offsetHeight (margin 미포함)
  - 긴 단락 → measurer 호출 → height = measured.lineHeight × N. **margin 무관**.
- 즉 **단락/heading 간 vertical margin 이 splitByLineHeight 누적에서 빠짐** — 이게 본 버그의 *가장 깔끔한* 단일 설명.

### 4.4 (덜 유력) measurement container 의 width 결정 시점 차이

EntryView.tsx:96~111 `measurePaperStyle` 은 `viewportTick` 의존. resize → 200ms debounce → `measurePaperStyle` 재계산 + `markdownTick` 변경 → useEffect 재 측정. 그런데 *최초 mount 직후 첫 useEffect* 는 :
- markdownTick 변경 (handleContentReady 호출 시)
- 그 시점에 measureRoot 의 *width* 가 이미 measurePaperStyle 적용된 fit 값으로 layout 됐는지가 핵심.

`renderMarkdownToHtml` 은 async. 그 반환 후 `.innerHTML = …` → `runMermaid` → `onContentReady`. 이 사이에 React layout commit 이 한 번 더 일어났는지 보장은 없음. 단 measurePaperStyle 이 inline `width: fit.width + 'px'` 로 이미 박혀 있어서 layout 자체는 fix 됨. **이 가설은 가능성 낮음**.

### 4.5 (덜 유력) `flat = Array.from(content.children)` 로 손자 element 가 누락

paginate.ts:143 — measureRoot 의 *direct children* 만 line stream 에 입력. markdown pipeline 이 callout 등 wrapper div 를 만들면 그 *내부* element 의 line 누락 가능. 단 이 페이지는 callout 없음 (h1/h2/p 만) 이라 본 버그의 직접 원인 아님.

## 5. 가장 가능성 높은 root cause (정량 추정)

§4.3 의 **단락/heading 간 CSS margin (margin-top / margin-bottom) 이 line height 누적에서 빠진 것**.

근거:
1. `<p>` 5 개 사이 collapse 후 누적 ~ 48 px → §1.3 의 47 px overflow 와 ±1 px.
2. `buildLineStream` 의 어떤 branch 도 `getBoundingClientRect`/`marginTop`/`marginBottom` 을 더하지 않음.
3. `splitByLineHeight` 도 line 단위 height 만 누적.
4. **이 누락은 line-단위 재설계 (v0.1.52) 에서 들어온 회귀 가능성** — 이전 element-단위 `splitByHeight` 는 `offsetHeight` 만 썼지만, `getBoundingClientRect.bottom - getBoundingClientRect.top` 도 margin 미포함이라 동일 문제. 단 element-단위 시절엔 *element 1 개 = group 1 step* 이라 margin 누락이 더 작은 단위에서 흡수됐을 가능성.

다만 **margin 가설만으론 horizontal/two-pages 외 vertical mm 모드에서도 동일 증상이 나야** 한다는 추론이 따른다. 사용자 시각 검증으로 *vertical/horizontal/two-pages 전 모드*에서 overflow 가 재현되는지 확인이 필요.

## 6. codex 에게 의뢰하는 작업

### 6.1 진단

1. 동일 콘텐츠 (자기소개서 5 단락) 를 jsdom 환경에서 mock 한 통합 테스트 작성 — `buildLineStream` + `splitByLineHeight` 결과와 *실 paper-page 안의 visible offsetHeight* 를 대조.
2. `getComputedStyle(child).marginTop / marginBottom` + collapse 를 `splitByLineHeight` 누적에 반영 시 overflow 재현률 변화 측정.
3. `createPretextMeasurer` 의 wrap line 수 vs browser 가 실제 그리는 wrap line 수 차이를 *별도* 비교 테스트 (예: 측정 컨테이너에 `<p>` 그대로 렌더 + `getClientRects().length` vs measurer 결과 length).
4. `--user-font-scale` / `--user-line-scale` CSS variable 이 measurement container 에 inherit 되는 시점 확인 (root.style 에 박혀 있는지, body level 인지). variable 누락 시 fallback 1 보장 여부.

### 6.2 fix (root cause 에 따라 분기)

- **case A — margin 누락이 주범** (§4.3, §5):
  - `lineStream.Line` 에 `marginBefore` / `marginAfter` field 추가 또는
  - `buildLineStream` 에서 element 단위로 `getComputedStyle(child).marginTop` / `marginBottom` 을 *첫/마지막 line 의 height* 에 가산 (margin collapse 처리 포함).
  - `splitByLineHeight` 의 누적 식을 `used + line.height + (line.marginBefore ?? 0)` 으로 수정.
  - 회귀 테스트: heading 다음 단락 / 단락 사이 margin / first-child margin-top:0 케이스 4 종.

- **case B — pretext 가 line 수 자체를 underreport** (§4.1):
  - 같은 내용을 *실제 DOM* 에 렌더 후 `Range` API + `getClientRects()` 로 line 수 추출하는 fallback 어댑터 추가.
  - 또는 pretext 호출 결과를 *실 DOM* 결과로 cross-validate 후 차이가 임계값 (예: 1 line 이상) 이면 DOM 결과로 교체.
  - 회귀 테스트: Korean / Korean+ASCII 혼합 / 긴 ASCII URL / 한자 일본어 (CJK 전반) 4 종.

- **case C — lineHeight resolve 가 측정 시점에 variable 미적용** (§4.2):
  - measurement container 의 `:root` / parent 에 user-font-scale/user-line-scale 명시 set 보장.
  - `readFontStyle` 의 fallback 식을 1.5 → CSS default `normal` (≈ 1.2) 로 보수화하지 말고, **CSS variable 이 없으면 측정 자체를 거부 + retry** 식 가드.

이 보고서의 의도는 case A/B/C 중 어느 것이 실 root cause 인지 codex 가 *진단 후* 결정하는 것. 본 작성 단계에선 case A 가 정량적으로 가장 깔끔하지만 한정 정보로 단정 불가.

### 6.3 코드리뷰 요청

- `viewer/src/lib/lineStream.ts` (특히 `buildLineStream` 의 분기, `splitByLineHeight` 의 누적 식, `groupLinesBySource` 의 boundary)
- `viewer/src/lib/paragraphSplit.ts` (`createPretextMeasurer`, `mapLineTextsToRanges`, `splitElementAtCharIndex` 의 attribute 복제 / id 누락 가드)
- `viewer/src/lib/paginate.ts` (`computePageFit` 의 viewport-fit, `computeLayout` 의 innerWidth/Height 분기)
- `viewer/src/components/pages/EntryView.tsx` (`measurePaperStyle` 의 inline sizing, `useEffect` 의존성, markdownTick / viewportTick 흐름)
- `viewer/src/components/pagination/PaperPage.tsx` (`renderSourceGroup` 의 cloneNode/extractCharRange, list re-wrap, fit cleanup)

특히 v0.1.63 에서 도입된 `MarkdownRenderer` 의 `as/className/style` props 가 measurement path 외부에서 잘못 사용되지 않는지 (postmortem §8.2 follow-up) 확인.

## 7. 검증 시 재현 환경

- viewer/plugin: `manifest.json` `0.2.0` (현재 main HEAD `6257bf9`).
- 콘텐츠: 자기소개서 (Korean prose, 5 단락 + h1/h2). 사용자 vault 에 존재.
- 설정: layout=Horizontal Scroll, pageSize=Auto, marginTop/Bottom=20mm, marginLeft/Right=25mm, theme/font 사용자 default.
- viewport: 1536×961 (DevTools open), 또는 비교용 1920×1080 / 1280×800.
- 동일 증상이 vertical Auto / vertical mm / two-pages 에서도 나는지 cross-check 권장.

## 8. 비-목적 (이 의뢰의 범위 *밖*)

- ADR 0028 작성 (paginate 재설계 사유) — 별도 후속.
- callout/blockquote 내부 분할 — spec §10 후속 이슈.
- table row / pre line 분할 — spec §10 후속 이슈.
- print CSS @media (page break) 통합 — 후속.

## 9. 메타

- 작성: AI (이 세션)
- 검증: 사용자 dogfood 시각 확인 의무 (BRAT update + plugin reload + 자기소개서 노트 reproduction).
- 다음 단계: codex `claude-code-guide` 또는 `codex-rescue` 등 second-opinion agent 에 본 문서 첨부 후 case A/B/C 진단 + fix PR 의뢰.
