---
date: 2026-04-28
type: 코드베이스 가이드 + 버그 리포트 (codex 의뢰용)
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - viewer
  - pagination
  - page-size
  - margin
  - bug
summary: pageSize 5종 (Auto, B4, A4, B5, A5) 사이에 시각 여백이 일관되지 않는다는 사용자 보고. 본 문서는 (1) page sizing 파이프라인 3 갈래 (vertical Auto / vertical 고정 mm / horizontal & two-pages) 의 코드 경로 매핑, (2) 두 곳에 분산된 CSS 변수 작성기 (usePageSizeCss vs applyViewSettings), (3) computePageFit 의 viewport-shrink 가 page size 별로 다른 scale 을 산출하는 구조를 정리하고, (4) "여백 다르다" 의 가능한 해석 4 가지 + 의심 root cause 4 종 + codex 가 검증할 항목을 정리.
related:
  - viewer/src/lib/paginate.ts
  - viewer/src/types/viewSettings.ts
  - viewer/src/lib/viewSettings.ts
  - viewer/src/hooks/usePageSizeCss.ts
  - viewer/src/components/pagination/PaperPage.tsx
  - viewer/src/components/pages/EntryView.tsx
  - viewer/src/app/globals.css
  - viewer/src/stores/viewerStore.ts
---

# pageSize × margin — 시각 여백 불일치 진단 가이드 (codex 의뢰)

## 0. TL;DR (codex 가 먼저 읽기)

- **현상**: `Auto / B4 / A4 / B5 / A5` 5 종 사이에 동일 `marginTop=20mm`, `marginLeft=25mm` 설정에서도 사용자 눈에 보이는 여백이 일관되지 않음.
- **확정 사항**:
  - `usePageSizeCss.ts` (`viewer/src/hooks/`) 와 `applyViewSettings()` (`viewer/src/lib/viewSettings.ts:30`) 두 곳에서 동시에 root style 의 page CSS variable 을 set 한다.
  - **두 hook 의 변수 이름이 서로 다르다.** `usePageSizeCss` 는 `--page-width-mm`, `--page-margin-top-mm` 류 (suffix `-mm`/`-px`) 를, `applyViewSettings` 는 `--page-width`, `--page-margin-top` 류 (suffix 없음) 를 set. **CSS rule (`globals.css:460-462`) 는 후자만 참조.** 전자는 dead variable. 직접 회귀 원인은 아닐 가능성이 크지만 코드베이스 혼란 요인.
- **유력 가설 (수치 검증 필요)**: `computePageFit` (`paginate.ts:54-119`) 의 *viewport-shrink* 단계 후 `scale = pageHeight / mmToPx(dims.h)` 가 page size 별로 다른 값을 내고, 이게 `padTop = mmToPx(marginTop) × scale` 에 그대로 곱해져 **각 page size 에서 절대 px 여백이 다르게 출력**된다. 물리적 paper 시뮬레이션 의미로는 *consistent* 하지만 사용자 의도 (예: viewport 안에서 동일 px 여백) 와 다를 수 있음.
- **의뢰 작업**:
  1. 사용자 의도 (§3) 4 가지 해석 중 어느 것이 spec 인지 확인.
  2. 의도가 정해지면 해당 해석에 맞춰 fix.
  3. dead variable 정리 + 단일 진입점 통일.

## 1. 페이지/여백 사이즈 결정 코드 경로 (3 갈래)

같은 `pageSize × margin` 설정이라도 layout 에 따라 *완전히 다른 코드 경로* 가 사이즈를 결정한다. 회귀 원인을 추적할 때 layout 별로 분리해서 봐야 한다.

### 1.1 vertical + Auto

| 단계 | 위치 | 처리 |
|---|---|---|
| measure 컨테이너 sizing | `EntryView.tsx:96-111` `measurePaperStyle` | `computePageFit` 결과 inline style |
| visible PaperPage sizing | `PaperPage.tsx:62-72` + `paginate.ts:121-125` `applyFitDims` | store 의 `fit` 적용 (inline) |
| line stream inner H/W | `paginate.ts:150-154` | `fit.innerHeight`, `fit.width - fit.padLeft - fit.padRight` |
| CSS variable | `globals.css:459-462` | inline 으로 override 됨 (CSS var 무시) |

→ **fit.padTop / padLeft 가 절대 px 여백.** scale = `(viewportH-32) / mmToPx(297)` (PAGE_DIMS.Auto = 210/297).

### 1.2 vertical + 비-Auto (B4 / A4 / B5 / A5)

| 단계 | 위치 | 처리 |
|---|---|---|
| measure 컨테이너 sizing | `EntryView.tsx:96-101` | **inline style 미적용** (`return undefined`) |
| visible PaperPage sizing | `PaperPage.tsx:62-72` | `fit === null` → inline `width/height/padding = ''` (clear) |
| line stream inner H/W | `paginate.ts:155-158` | `mmToPx(dims.h - marginTop - marginBottom)`, `mmToPx(dims.w - marginLeft - marginRight)` |
| CSS variable | `globals.css:459-462` | **applies — `var(--page-width)` 등 사용** |
| CSS variable 작성 | `viewSettings.ts:40-45` (`applyViewSettings`) — Zustand patch 시 호출 | `--page-width: ${dims.w}mm`, `--page-margin-top: ${marginTop}mm` 등 |

→ **여백은 절대 mm 단위**. 1mm = 3.7795 px (browser DPI 96). marginTop=20mm → 약 75.6px. **page size 가 달라져도 mm 절대값이 같으면 px 도 같음.**

### 1.3 horizontal / two-pages (Auto + 비-Auto 모두)

| 단계 | 위치 | 처리 |
|---|---|---|
| measure 컨테이너 sizing | `EntryView.tsx:102-108` | `computePageFit` 결과 inline |
| visible PaperPage sizing | `PaperPage.tsx:62-72` + `applyFitDims` | inline |
| line stream inner H/W | `paginate.ts:160-164` | `fit.innerHeight`, `fit.width - fit.padLeft - fit.padRight` |
| CSS variable | `globals.css:545-554` | width/height/padding 명시 X (inline 의존). border/background/shadow 만 |

→ **fit.padTop / padLeft 가 절대 px 여백** = `mmToPx(marginTop) × scale` 인데 **scale 이 page size 별로 다름** (§2 상세).

## 2. `computePageFit` 의 scale 계산 — page size 가 여백에 영향 미치는 핵심 지점

`paginate.ts:54-119`:

```ts
const viewportH = window.innerHeight - headerH - 32          // line 66
const viewportW = window.innerWidth - 32

if (settings.pageSize === 'Auto') {
  pageHeight = viewportH - 32                                // line 78  ← Auto 만 -32 추가
  pageWidth = pageHeight * ratio                              // ratio = dims.w/dims.h, dims=Auto={210,297}
} else {
  pageWidth = mmToPx(dims.w)                                 // line 81-82
  pageHeight = mmToPx(dims.h)
}

// width budget shrink
const widthBudget = layout === 'two-pages'
  ? (viewportW - gap - 64) / 2
  : viewportW - 64
if (widthBudget < pageWidth) { pageWidth = widthBudget; pageHeight = pageWidth / ratio }

// height budget shrink
const heightBudget = viewportH - 32                          // line 94 ← non-Auto 가 도달하는 한도
if (heightBudget < pageHeight) { pageHeight = heightBudget; pageWidth = pageHeight * ratio }

const scale = pageHeight / mmToPx(dims.h)                    // line 102 ★ 여백 핵심
const padTop = mmToPx(settings.marginTop) * scale
```

### 2.1 viewport 961 × 1536 에서의 수치 추정 (사용자 환경)

`headerH = 56`, `viewportH = 873`, `viewportW = 1504`, `widthBudget = 1440`, `heightBudget = 841`.

| pageSize | dims (mm) | 초기 page (px) | shrink 후 page (px) | scale | padTop (mm 20) | padLeft (mm 25) |
|---|---|---|---|---|---|---|
| Auto  | 210 × 297 (ratio) | 594.7 × 841 | (변동 X) | 0.7493 | 56.6 px | 70.8 px |
| A4    | 210 × 297 | 793.7 × 1122.5 | 594.7 × 841 (height shrink) | 0.7493 | 56.6 px | 70.8 px |
| B4    | 257 × 364 | 971 × 1376    | 593.7 × 841 (height shrink) | 0.6111 | 46.2 px | 57.7 px |
| B5    | 182 × 257 | 687.7 × 971   | 595.6 × 841 (height shrink) | 0.8662 | 65.5 px | 81.9 px |
| A5    | 148 × 210 | 559 × 793.7   | (변동 X)  | 1.0000 | 75.6 px | 94.5 px |

→ `Auto ≡ A4`, 그 외는 모두 **다른 절대 px 여백**. 사용자가 보는 "5 모두 다르다" 와 거의 일치 (Auto vs A4 만 동일).

### 2.2 왜 page size 별로 scale 이 다른가

- viewport-fit shrink 후 `pageHeight = 841` 로 모두 수렴 (A5 만 미수렴 — 원본이 viewport 안에 들어감).
- scale 식 `pageHeight / mmToPx(dims.h)` 의 분자는 같지만 분모는 page size 별 *원본 mm 높이* — 다르므로 결과 다름.
- 이는 **"논리적 paper 의 25mm 는 항상 25mm of paper"** 모델과 일관 (B4 종이는 더 큰 캔버스라, viewport 에 압축됐을 때 25mm 도 압축됨).
- 단 사용자가 **"viewport 안에서 25mm 는 항상 25mm 보여야 한다"** 고 기대했다면 위 동작은 직관과 어긋남.

## 3. "여백 다르다" — 사용자 의도 4 가지 해석

| 해석 | 의미 | 현 코드 일치? | 수정 시 영향 |
|---|---|---|---|
| **H-A 물리 paper 일관** | 25mm 는 *원본 paper 의 25mm*. viewport-shrink 시 비례 축소. | ✓ horizontal/two-pages 의 현 동작 | 변경 불필요 |
| **H-B viewport-relative 일관** | 25mm 는 *viewport 안의 25mm 만큼* (px=mm × 96/25.4 고정). page size 무관. | ✗ horizontal/two-pages | scale 곱 제거 + 가독성 검토 |
| **H-C 모든 layout 통일** | layout 무관 (vertical 고정 mm 도 horizontal scale 도) 동일 px 여백. | ✗ vertical 고정 mm 와 horizontal scale 의 결과 다름 | sizing 일원화 — sizing source of truth 단일화 |
| **H-D 기대했지만 안 된 것: Auto = 다른 size 들** | Auto 와 A4/B4/B5/A5 모두 동일 시각 여백 표시. | ✗ Auto ≡ A4 만 동일 | scale 정규화 또는 Auto 정의 변경 |

→ codex 는 사용자에게 **어느 해석이 spec 인지** 먼저 확인 필요. 코드를 수정하기 전에 의도 합의가 우선.

## 4. 추가 확인된 문제 — dead CSS variable hook

`usePageSizeCss.ts:25-33` 가 root style 에 다음 변수를 set:

```ts
root.setProperty('--page-width-mm', `${dims.w}mm`)
root.setProperty('--page-height-mm', `${dims.h}mm`)
root.setProperty('--page-width-px', `${mmToPx(dims.w)}px`)
root.setProperty('--page-height-px', `${mmToPx(dims.h)}px`)
root.setProperty('--page-margin-top-mm', `${settings.marginTop}mm`)
root.setProperty('--page-margin-bottom-mm', `${settings.marginBottom}mm`)
root.setProperty('--page-margin-left-mm', `${settings.marginLeft}mm`)
root.setProperty('--page-margin-right-mm', `${settings.marginRight}mm`)
```

→ **`globals.css` 에서 위 변수들을 참조하는 rule 은 0 곳.** grep 으로 확인 (§5.1 검증 step).

CSS rule (`globals.css:460-462`) 가 참조하는 `--page-width / --page-height / --page-margin-*` 는 `viewSettings.ts:40-45 applyViewSettings()` 가 set. 이 함수는 Zustand `patchSettings`/`onRehydrateStorage` 안에서 호출. **즉 실제 작동하는 변수 작성기는 `applyViewSettings`. `usePageSizeCss` 는 dead.**

`usePageSizeCss` 를 RootClient.tsx:30 에서 호출. dead 라도 무해 (CSS rule 이 참조 안 하니까) 지만:
- 초보자가 "`--page-width-mm` 변수를 갱신하면 페이지 크기가 바뀐다" 고 오해 가능
- 시간이 흘러 `globals.css` 가 silent rename (예: `--page-width` → `--page-width-mm`) 되는 시점에 어느 hook 이 source of truth 인지 혼선

**제안**: `usePageSizeCss` 를 **삭제** 하거나, `applyViewSettings` 가 set 하는 변수와 *동일 이름* 으로 통일. 단일 진입점 의무.

## 5. codex 검증 의뢰 항목

### 5.1 dead variable 확인 (5 분)

```bash
# 첫 번째 명령: usePageSizeCss 가 set 하는 변수가 CSS rule 에서 사용되는지
grep -rn "--page-width-mm\|--page-height-mm\|--page-width-px\|--page-height-px\|--page-margin-top-mm\|--page-margin-bottom-mm\|--page-margin-left-mm\|--page-margin-right-mm" viewer/src/

# 결과: usePageSizeCss.ts 자체 외엔 0 hit 이어야 함. 0 hit 이면 dead 확정.
```

### 5.2 페이지 별 px 여백 측정 (브라우저 / DevTools 또는 component test)

- viewport 961 × 1536, headerH 56 가정.
- 5 page size 각각 horizontal layout, marginTop=20mm, marginLeft=25mm 로 설정.
- DevTools 에서 `.paper-page` 의 inline `padding` 값을 캡처 (또는 `getBoundingClientRect` + `getComputedStyle`).
- §2.1 표와 일치하는지, 일치하지 않으면 어디가 어긋나는지 확인.

### 5.3 vertical 고정 mm 의 절대 mm 일관성 검증

- vertical, A4 / B4 / B5 / A5, marginTop=20mm 모두에서 `.paper-page` 의 `padding-top` 이 정확히 `20mm` (= 75.59 px) 인지 확인.
- 만약 unit conversion 단계 (mm → px) 가 layout 별로 다르면 회귀 가능.

### 5.4 Auto 모드의 -32 추가 마진 의도 확인 (`paginate.ts:78`)

```ts
if (settings.pageSize === 'Auto') {
  pageHeight = viewportH - 32   // ← 이 -32 의 의미는?
}
```

- viewportH 자체에 이미 `headerH + 32` 가 빠져있음. 추가 -32 의 의도? gap/border 여유분?
- non-Auto 가 heightBudget 을 통해 도달하는 값 (`viewportH - 32`) 과 **수치상 동일**. 단 non-Auto 는 widthBudget shrink 가 먼저 일어나면 다른 값에 도달 가능 → 이 분기에서만 Auto vs A4 결과가 어긋날 가능성 (사용자 환경에서 widthBudget 이 widthBudget < pageWidth 인 narrow viewport).
- 코드 의도 주석 부족 — `// line 78: 왜 -32 더?` 가 spec 명시되어야 함.

### 5.5 widthBudget 시 ratio 계산이 정확한지

```ts
if (widthBudget < pageWidth) {
  pageWidth = widthBudget
  pageHeight = pageWidth / ratio   // ← / ratio 인지 * ratio 인지 점검
}
```

- `ratio = dims.w / dims.h` 인데, `width = height × ratio` 라면 역수는 `height = width / ratio`. ✓ 맞음.
- 단 height budget 분기는 `pageWidth = pageHeight * ratio` ✓ 맞음.
- 두 분기의 ratio 사용이 inverse 관계로 일관 — OK. 불일치 없음.

## 6. 의심 root cause 우선순위 (codex 검토 후 sprint 분배 제안)

1. **사용자 의도 확정** (§3 H-A/B/C/D) — 코드 수정 결정의 선행 조건.
2. **dead `usePageSizeCss` hook 정리** — 즉시 안전한 cleanup. 동작 변경 없음.
3. **horizontal/two-pages 의 scale 곱 검토** — H-B/C/D 가 의도면 이 식을 변경. H-A 면 그대로 두고 사용자에게 "물리 paper 모델" 설명.
4. **Auto 의 `-32` 매직 넘버 의미 명문화** — 주석 + 단위 테스트 추가.
5. **layout 별 sizing source of truth 통일** — vertical 고정 mm 와 horizontal/two-pages 의 inline path 가 갈라지는 구조 정비. 가능하면 `computePageFit` 단일 진입점.

## 7. 메타 / 참고

### 7.1 관련 문서

- `docs/superpowers/specs/2026-04-26-viewer-rewrite-spec.md` (본 문서 작성 시 미확인 — viewer 재설계 spec 에 page size 의도 명시 가능성)
- `docs/postmortems/2026-04-28-viewer-pagination-review-fix.md` §4.1 — measurement DOM 과 visible DOM 동기화 invariant. 본 버그가 의도 차이가 아니라 동기화 차이라면 이 invariant 점검부터.
- `docs/bug-reports/2026-04-28-pretext-pagination-still-overflowing.md` — 직전 fix (v0.2.1, vertical margin 누락). 본 버그와 다른 layer.

### 7.2 메타데이터

- main HEAD: `08d9901` (release v0.2.1)
- 사용자 환경 (스크린샷): viewport 961 × 1536, layout=Horizontal Scroll, pageSize=Auto/B4/A4/B5/A5 비교
- viewer test: 11 files / 84 tests pass (이 버그를 잡는 테스트는 *없음* — 본 의뢰 후 추가 필요)
- typecheck / build: pass

### 7.3 codex 가 *작업하지 말아야* 하는 영역

- pretext / line stream / paragraph split — 별 layer.
- markdown pipeline (remark/rehype) — 별 layer.
- live reload / SSE — 별 layer.
- release.yml / version bump 절차 — 사용자 도메인.
