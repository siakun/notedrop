---
date: 2026-04-28
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - postmortem
  - viewer
  - pagination
  - zustand
  - review-fix
summary: Zustand 기반 페이지네이션 refactor 리뷰에서 발견된 measurement DOM 불일치, fixed vertical fit 오적용, PaperPage inline style 잔류, total=0 strip indicator 노출 회귀를 수정. 구조 회귀 테스트 4개 추가 후 viewer test/typecheck/build 검증 완료
---

# viewer pagination review fix — measurement DOM 과 visible DOM 재동기화

## 1. Executive Summary

Zustand 기반 페이지네이션 refactor 이후 리뷰에서 **측정 DOM 과 실제 표시 DOM 이 달라지는 회귀**가 발견됐다. 핵심은 `computeLayout` 이 보는 hidden measurement tree 와 `PaginatedView` 가 사용자에게 보여주는 `PaperPage` tree 의 CSS 구조가 달라졌다는 점이다. 이 차이 때문에 vertical/horizontal/two-pages 에서 페이지 높이 계산, unit element 측정, strip indicator 가 실제 렌더링과 어긋날 수 있었다.

이번 세션에서 처리한 리뷰 항목:
- **P1**: measurement DOM 이 visible page 와 구조적으로 다름. hidden `.paper-page` 안에 nested `.entry-content` 가 생겨 CSS direct-child 조건이 실제 페이지와 불일치.
- **P2**: fixed vertical (`layout='vertical'`, `pageSize !== 'Auto'`) 도 measurement effect 에서 `computePageFit` 을 다시 적용해 visible page 보다 작은 viewport-fit 크기로 측정.
- **P2**: `PaperPage` 가 `fit === null` 로 전환될 때 이전 inline `width/height/padding` 을 지우지 않아 layout 전환 후 stale style 잔류.
- **P3**: horizontal/two-pages 에서 `total === 0` 인데도 indicator 를 표시해 `1 / 0` 가능.

결과:
- `MarkdownRenderer` 가 measurement 용 root tag/class/style 을 받을 수 있도록 확장.
- `EntryView` 의 measurement DOM 을 visible pagination 구조와 맞춤.
- fixed vertical measurement 에서 viewport fit 재적용 제거.
- `PaperPage` fit 제거 시 inline sizing clear.
- strip navigation 의 `total <= 0` indicator hidden 처리.
- 회귀 테스트 4개 추가.

검증:
- focused regression tests: 3 files / 4 tests 통과
- viewer `npm test`: 11 files / 81 tests 통과
- viewer `npm run typecheck`: 통과
- viewer `npm run build`: Next.js production build 통과

## 2. Background

Zustand refactor 는 pagination result 를 store (`pages`, `fit`) 에 보관하고 `PaginatedView` 가 store 기반으로 `PaperPage` 를 렌더링하는 구조로 바꿨다. 이 구조 자체는 React reconciliation 과 sourceGroups reference 관리 측면에서 맞지만, hidden measurement path 가 visible render path 와 완전히 같은 구조를 유지해야 한다는 조건이 있었다.

페이지네이션은 다음 순서로 동작한다.

1. `EntryView` 가 off-screen measurement DOM 에 markdown 을 렌더링한다.
2. `MarkdownRenderer` 의 `onContentReady` 후 `computeLayout(root, settings, layout)` 이 root 의 direct children 을 기준으로 line stream 을 만든다.
3. `setLayoutResult(pages, fit)` 로 Zustand store 에 결과를 저장한다.
4. `PaginatedView` 가 store 를 읽어 visible `.entry-content` 안에 `PaperPage` 들을 렌더링한다.

문제는 1번의 hidden DOM 이 4번의 visible DOM 과 달랐다는 점이다. CSS 는 `.entry-content`, `.page-strip`, `.paper-page` 의 ancestry 와 direct child 구조에 의미를 둔다. 따라서 hidden tree 가 한 단계라도 다르면 `offsetHeight`, `offsetWidth`, flex/gap/centering, overflow 조건이 달라지고 페이지 split 결과가 흔들린다.

## 3. Timeline

### 3.1 리뷰 수신

리뷰는 4개 항목으로 들어왔다. 모두 `EntryView`, `PaperPage`, `useStripNavigation` 의 페이지네이션 boundary 에 집중되어 있었다. feedback 을 코드와 대조한 결과 실제 코드가 리뷰 설명과 일치했다.

확인한 기존 상태:
- `EntryView` measurement path:
  - hidden container `<div aria-hidden>`
  - child `<section class="paper-page">`
  - inside `<MarkdownRenderer>` 가 다시 `<div class="entry-content">` 생성
- visible path:
  - `<div class="entry-content">`
  - vertical: direct child `PaperPage(section.paper-page)`
  - horizontal/two-pages: direct child `.page-strip`, 그 안에 `PaperPage`

즉 measurement 에서는 `.paper-page > .entry-content > markdown blocks`, visible 에서는 `.entry-content > .paper-page > markdown blocks` 또는 `.entry-content > .page-strip > .paper-page > markdown blocks` 였다.

### 3.2 RED — 회귀 테스트 추가

테스트는 리뷰 항목을 직접 잡도록 component-level 로 추가했다.

추가 파일:
- `viewer/src/components/pages/EntryView.test.tsx`
- `viewer/src/components/pagination/PaperPage.test.tsx`
- `viewer/src/hooks/useStripNavigation.test.tsx`

처음 실행에서는 테스트 JSX runtime 의 `React is not defined` 보정이 필요했다. 테스트 harness 를 보정한 뒤에는 의도한 회귀로 실패했다.

실패 내용:
- `EntryView` fixed vertical test: `computeLayout` 이 `.paper-page` 가 아니라 nested `.entry-content` 를 측정하고 있음.
- `EntryView` horizontal test: hidden root 가 `.entry-content > .page-strip > .paper-page` 구조가 아님.
- `PaperPage` test: `fit` 을 `null` 로 rerender 해도 inline `width: 640px` 잔류.
- `useStripNavigation` test: `total=0` 에도 indicator `visible=true`.

### 3.3 GREEN — 최소 수정

#### 3.3.1 `MarkdownRenderer` root customization

`MarkdownRenderer` 에 다음 optional props 를 추가했다.

```ts
as?: 'div' | 'section'
className?: string
style?: CSSProperties
```

기본값은 기존과 동일하게 `<div class="entry-content">` 이다. pagination measurement 에서만 `as="section"`, `className="paper-page"` 로 호출해 nested `.entry-content` 없이 markdown blocks 를 paper page 의 direct children 으로 넣는다.

이 결정의 이유:
- markdown pipeline, mermaid 처리, `onContentReady` callback 은 그대로 재사용.
- visible `PaperPage` 의 DOM shape 를 measurement path 에 맞추기 위해 별도 renderer 를 새로 만들 필요가 없음.
- default render path 는 기존 사용자-facing markdown rendering 과 호환 유지.

#### 3.3.2 `EntryView` measurement DOM 구조 수정

measurement tree 를 visible pagination 구조와 맞췄다.

vertical:
```tsx
<div aria-hidden className="entry-content">
  <MarkdownRenderer as="section" className="paper-page" />
</div>
```

horizontal/two-pages:
```tsx
<div aria-hidden className="entry-content">
  <div className="page-strip">
    <MarkdownRenderer as="section" className="paper-page" />
  </div>
</div>
```

또한 measurement effect 안의 imperative fit 재적용을 제거했다.

기존에는 `measurePaperStyle` 에서 fixed vertical 일 때 inline style 을 의도적으로 비워도, effect 에서 다시:

```ts
const newFit = computePageFit(settings, settings.layout)
if (newFit) applyFitDims(measureEl, newFit)
```

를 실행했다. 이 경로 때문에 `computeLayout` 은 fixed vertical 을 mm 크기로 계산하면서도 실제 measurement DOM 은 viewport-fit inline size 를 갖는 모순이 생겼다. 이제 measurement sizing source of truth 는 `measurePaperStyle` + CSS variable 이며, fixed vertical 에서는 inline fit 을 적용하지 않는다.

#### 3.3.3 `PaperPage` stale inline style clear

`fit` 이 있는 경우에는 기존처럼 `applyFitDims(el, fit)` 를 적용한다. `fit === null` 이면 inline style 을 명시적으로 지운다.

```ts
el.style.width = ''
el.style.height = ''
el.style.padding = ''
```

React 가 같은 index key 의 `PaperPage` 를 재사용하는 동안에도 Auto/horizontal/two-pages 에서 남은 inline size 가 fixed vertical CSS variable 을 override 하지 않게 된다.

#### 3.3.4 `useStripNavigation` total=0 guard

horizontal/two-pages strip indicator update 에서 `total <= 0` 이면 hidden state 를 publish 하도록 변경했다.

```ts
setIndicator({ visible: false, current: 0, total: 0, layout })
```

이로써 empty markdown, fit failure, first layout result 전 상태에서 `PageIndicator` 가 `1 / 0` 을 표시하지 않는다.

## 4. Technical Decisions

### 4.1 measurement DOM 은 visible DOM 의 lightweight copy 여야 한다

이번 문제의 핵심은 content 만 같으면 충분하다는 가정이 틀렸다는 점이다. 이 viewer 의 layout CSS 는 markdown block 자체뿐 아니라 ancestor 와 direct child 관계를 기준으로 동작한다.

따라서 pagination measurement 의 invariant 는 다음으로 둬야 한다.

> `computeLayout` 이 읽는 root 는 visible `PaperPage` 와 같은 CSS context 와 child structure 를 가져야 한다.

특히 `.entry-content` 는 markdown styling class 이면서 layout container class 이기도 하다. nested 위치가 바뀌면 단순한 class name 차이가 아니라 flex/gap/overflow/width 계산 차이가 된다.

### 4.2 fit null 은 "아무것도 하지 않음" 이 아니라 "inline fit 제거" 다

`PageFit | null` 의 의미가 layout 별로 다르다.

- `fit !== null`: viewport-fitted paper size 를 inline style 로 적용해야 함.
- `fit === null`: CSS variable/mm sizing 에 맡겨야 함.

따라서 `fit === null` 에서 effect 를 early return 하면 이전 inline style 이 남아 의미가 반대로 바뀐다. null state 는 cleanup action 을 포함해야 한다.

### 4.3 measurement effect 는 sizing 을 두 번 결정하면 안 된다

`measurePaperStyle` 이 이미 layout/pageSize 별 inline sizing 여부를 결정한다. effect 에서 다시 `computePageFit` 을 호출하면 `computeLayout` 의 branch 와 DOM state 가 분리된다. 이번 fixed vertical 회귀가 그 결과였다.

앞으로 measurement sizing 은 한 곳에서만 결정해야 한다.

## 5. Tests Added

### 5.1 `EntryView.test.tsx`

검증 내용:
- fixed vertical measurement root 가 `.paper-page` 자체인지.
- markdown block 이 `.paper-page` 의 direct child 로 들어가는지.
- hidden root 가 `.entry-content` 인지.
- fixed vertical 에서 `computePageFit` / `applyFitDims` 가 호출되지 않는지.
- horizontal measurement 가 `.entry-content > .page-strip > .paper-page` 구조인지.

이 테스트는 DOM height 자체를 mock 하지 않는다. 의도는 layout algorithm 의 수치가 아니라 **측정 대상 DOM shape** 를 고정하는 것이다.

### 5.2 `PaperPage.test.tsx`

검증 내용:
- `fit` 적용 시 inline width/height/padding 이 설정됨.
- 같은 component instance 를 `fit={null}` 로 rerender 하면 inline width/height/padding 이 제거됨.

이 테스트가 React key reuse 상황을 가장 작게 재현한다.

### 5.3 `useStripNavigation.test.tsx`

검증 내용:
- `layout='horizontal'`, `total=0` 에서 indicator state 가 hidden 으로 publish 됨.

이 테스트는 `PageIndicator` 표시 문자열까지 가지 않고 store state boundary 에서 회귀를 막는다.

## 6. Verification

Focused regression:

```bash
npm test -- --run src/components/pages/EntryView.test.tsx src/components/pagination/PaperPage.test.tsx src/hooks/useStripNavigation.test.tsx
```

결과:
- 3 files passed
- 4 tests passed

Full viewer test:

```bash
npm test
```

결과:
- 11 files passed
- 81 tests passed

Typecheck:

```bash
npm run typecheck
```

결과:
- `tsc --noEmit` exit 0

Production build:

```bash
npm run build
```

결과:
- Next.js 14.2.35 production build compiled successfully
- static pages generated successfully

Note: Vitest 실행 시 Vite CJS Node API deprecation warning 은 기존 환경 warning 으로 남아 있다. 테스트 실패와는 무관하다.

## 7. Lessons Learned

### 7.1 pagination test 는 utility 단위만으로 부족하다

기존 `paginate.test.ts` 는 `mmToPx`, `clamp`, `round1` 같은 pure utility 를 확인했다. 하지만 이번 회귀는 pure function 내부가 아니라 React hidden DOM, CSS class ancestry, inline style lifecycle 에 있었다.

교훈: pagination 은 적어도 다음 3계층 테스트가 필요하다.
- pure utility / line stream
- measurement DOM shape
- visible component style lifecycle

### 7.2 hidden measurement DOM 은 "보이지 않는 visible DOM" 이어야 한다

off-screen 이라는 이유로 wrapper 를 단순화하면 pagination 에서는 오히려 틀린 측정이 된다. 숨겨진 DOM 은 시각적으로 보이지 않을 뿐, CSS 구조는 visible DOM 과 같아야 한다.

### 7.3 inline style 은 layout mode 전환에서 부채가 된다

viewport-fit 은 inline style 로 적용된다. fixed vertical 은 CSS variable/mm sizing 에 의존한다. 이 둘 사이를 오갈 때 inline style 을 제거하지 않으면 React remount 여부에 따라 동작이 달라진다.

앞으로 `fit` 같은 nullable style state 는 "set or clear" 를 한 effect 안에서 처리해야 한다.

### 7.4 리뷰 항목은 모두 같은 invariant 의 다른 증상일 수 있다

이번 4개 항목은 따로 보면 DOM nesting, fit, inline style, indicator 문제였지만 공통 원인은 pagination state 와 DOM representation 의 동기화였다. 단순히 각 줄을 patch 하기보다 invariant 를 먼저 정리한 것이 수정 범위를 좁히는 데 도움이 됐다.

## 8. Unresolved / Follow-up

### 8.1 live visual verification 미실행

이번 세션에서는 automated unit/component test, typecheck, production build 까지 확인했다. 실제 Obsidian dogfood vault 또는 browser screenshot 으로 vertical/horizontal/two-pages 의 visual page split 을 확인하지는 않았다.

추가로 확인하면 좋은 시나리오:
- fixed A4 vertical 에서 image/table 이 page boundary 를 넘지 않는지.
- horizontal/two-pages 전환 후 page size 가 이전 Auto fit 에서 stale 하지 않은지.
- empty markdown 또는 layout 초기화 시 indicator 가 숨겨지는지.

### 8.2 `MarkdownRenderer` root prop 의 사용 범위

`as/className/style` props 는 현재 measurement path 를 위해 도입됐다. 일반 render path 기본값은 유지되지만, 이 API 가 다른 곳에서 남용되면 markdown styling root invariant 가 흐려질 수 있다. 필요한 곳은 pagination measurement 로 제한하는 것이 좋다.

## 9. Reference

변경 파일:
- `viewer/src/components/markdown/MarkdownRenderer.tsx`
- `viewer/src/components/pages/EntryView.tsx`
- `viewer/src/components/pagination/PaperPage.tsx`
- `viewer/src/hooks/useStripNavigation.ts`

추가 테스트:
- `viewer/src/components/pages/EntryView.test.tsx`
- `viewer/src/components/pagination/PaperPage.test.tsx`
- `viewer/src/hooks/useStripNavigation.test.tsx`

관련 리뷰 항목:
- P1: Keep the measurement DOM structurally identical to pages
- P2: Don't fit fixed vertical measurement pages
- P2: Clear inline sizing when fit is removed
- P3: Hide the strip indicator when there are no pages
