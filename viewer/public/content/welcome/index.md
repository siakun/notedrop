---
hash: welcome
slug: welcome
title: notedrop 에 오신 것을 환영합니다
render: doc
type: entry
parent: null
order: null
cover: null
customCss: null
publishedAt: 2026-04-26T00:00:00.000Z
updatedAt: 2026-04-26T00:00:00.000Z
---

# notedrop

옵시디언 vault 의 일부 노트를 GitHub Pages 정적 뷰어로 발행하는 플러그인입니다.

이 페이지는 발행된 노트가 없을 때 표시되는 자리표시자입니다.
플러그인의 **Publish vault to GitHub** 명령을 실행하면 manifest 가 갱신되며 이 페이지는 사라집니다.

아래 내용은 페이지네이션 동작을 확인하기 위한 예시 본문이며, 실제 사용 흐름·기능 설명도 함께 정리되어 있습니다.

## 빠른 시작

1. Obsidian 에서 BRAT 으로 notedrop 설치
2. Settings → Notedrop 탭에서 GitHub PAT, target repo 설정
3. 발행할 노트의 frontmatter 에 `notedrop-publish: true`
4. Settings → Notedrop → Publish 버튼 또는 Command palette → `Notedrop: Publish vault to GitHub`
5. GH Actions deploy 가 1~2 분 안에 정적 뷰어를 갱신

설치가 끝나면 별도 서버 설정 없이 GitHub Pages 도메인에서 바로 접근할 수 있습니다.
PAT 권한은 target repo 의 `contents: write` 만 있으면 충분하며, 그 이상은 요구하지 않습니다.

## 핵심 가치

notedrop 은 다음 세 가지를 동시에 만족시키는 것을 목표로 합니다.

- **로컬 우선**: 원본은 항상 로컬 vault. 발행은 부산물이며, 발행을 멈춰도 원본은 손상되지 않습니다.
- **정적 출력**: 결과물은 어떤 런타임 의존성도 없는 정적 HTML / CSS / JS. GH Pages 외에도 어떤 정적 호스팅에도 배포할 수 있습니다.
- **선택적 공개**: vault 전체가 아닌, frontmatter 로 지정된 노트만 선별 발행. 비공개 메모와 공개 글이 한 vault 안에 공존할 수 있습니다.

## 주요 기능

### 발행 파이프라인

플러그인이 vault 안에서 `notedrop-publish: true` 가 표시된 노트만 모아 정규화 → 의존 자산 (이미지·첨부) 인라인 → manifest 갱신 → GitHub API 로 target repo 에 push 합니다. push 가 끝나면 target repo 의 GitHub Actions 워크플로가 실행되어 viewer 정적 자산을 다시 빌드하고 GH Pages 로 배포합니다.

### 뷰어

뷰어는 Next.js 14 의 `output: 'export'` 모드로 만들어진 단일 정적 번들입니다. 한 페이지로 보이지만 내부적으로는 SPA 처럼 동작하며, hover 시 미리 fetch 해 두는 prefetch 와 라우터 캐시로 첫 진입 후 거의 모든 노트 전환이 즉시 일어납니다.

### 페이지네이션

긴 노트를 종이 페이지처럼 나눠 보여 줍니다. 다음 요소를 측정해 한 페이지의 가용 높이 안에서 자르고, 불가피한 경우에만 다음 페이지로 넘깁니다.

- `line-height` 누적
- 블록 사이 vertical margin (collapse 규칙 포함)
- 표·이미지·코드블록 같은 분리 불가 블록의 높이

페이지 전환은 키보드 ←/→, 마우스 휠, 터치 swipe 모두 지원합니다.

### 다양한 layout

뷰어 우측 상단의 ⚙ 버튼을 누르면 layout · margin · page size 를 즉시 바꿀 수 있습니다.

- **Default**: 한 페이지를 화면 가운데에 표시. 가장 단순한 모드.
- **Vertical scroll**: 종이 페이지를 위→아래로 이어 붙여 한 줄로 스크롤.
- **Horizontal**: 종이 페이지를 좌→우로 이어 붙여 가로 스크롤. 와이드 모니터에 적합.
- **Two pages**: 두 페이지를 펼친 책처럼 좌우로 나란히 표시.

### 여백 / 페이지 크기

여백은 mm 단위 stepper 로 1 mm 씩 조정할 수 있고, 페이지 크기는 Auto / B4 / A4 / B5 / A5 중에서 고를 수 있습니다. Auto 는 화면 비율에 맞춰 자동으로 조정되며, 나머지는 실제 종이 비율을 따릅니다.

## 발행 흐름 자세히

### 1 단계 — 노트 선별

vault 안의 노트 중 frontmatter 에 `notedrop-publish: true` 가 있는 것만 발행 대상으로 잡습니다. 폴더 전체가 아니라 노트 단위 의사결정이라 실수로 비공개 메모가 공개되는 사고를 줄여 줍니다.

### 2 단계 — 정규화

마크다운을 파싱하면서 다음을 정리합니다.

- wikilink (`[[...]]`) → 표준 link 또는 텍스트로 변환
- 첨부 이미지 path 를 발행 repo 기준 상대 경로로 재작성
- 의존 자산 (이미지·PDF·첨부) 을 발행 repo 의 `assets/` 안에 사본 작성
- frontmatter 의 발행용 필드 (title, slug, parent, order, cover) 추출

### 3 단계 — manifest 갱신

발행 결과는 `manifest.json` 에 인덱싱됩니다. manifest 에는 노트 목록 · 부모-자식 관계 · 발행 일자 · 콘텐츠 hash 가 저장되어, 변경된 노트만 다시 build 할 수 있게 해 줍니다.

### 4 단계 — push 와 배포

GitHub REST API 로 한 번의 commit 으로 변경 분을 push 합니다. target repo 의 release / pages 워크플로가 trigger 되어 viewer 자산을 빌드하고 GH Pages 로 배포합니다. 일반적으로 push 부터 노출까지 1~2 분 안에 끝납니다.

## frontmatter 필드 정리

발행 동작에 영향을 주는 frontmatter 필드는 다음과 같습니다.

- `notedrop-publish` (bool): true 일 때만 발행 대상.
- `slug` (string, 선택): URL path 에 쓰일 식별자. 미지정 시 파일 이름에서 추론.
- `title` (string, 선택): 뷰어 상단·navigation 에 노출될 제목. 미지정 시 첫 H1 사용.
- `parent` (string, 선택): 부모 노트의 slug. 트리 구조 nav 를 만드는 근거.
- `order` (number, 선택): 같은 parent 안에서의 정렬 순서.
- `cover` (string, 선택): 카드 형태로 보일 때 사용할 thumbnail 자산 경로.
- `notedrop-css` (string, 선택): 노트 본문에 인라인으로 적용할 CSS. 짧은 페이지 단위 커스터마이즈에 사용.
- `notedrop-css-file` (string, 선택): vault 안 별도 CSS 파일 경로. 길거나 공유되는 스타일은 이쪽으로 분리.

> 위 필드는 모두 선택이며, 가장 단순한 발행은 `notedrop-publish: true` 한 줄로 충분합니다.

## 뷰어 단축키

뷰어는 키보드만으로도 충분히 다룰 수 있도록 설계되어 있습니다.

- **← / →**: 이전 / 다음 페이지
- **↑ / ↓**: 같은 노트 안에서의 줄 단위 스크롤 (vertical layout 한정)
- **n / p**: 다음 / 이전 노트
- **/**: 노트 검색
- **Esc**: 검색 / 패널 닫기
- **? 또는 h**: 도움말 패널

마우스 사용자는 뷰어 우측의 floating navigator 와 좌하단의 페이지 표시기로 같은 동작을 수행할 수 있습니다.

## hover prefetch

링크 위에 마우스를 0.2 초 이상 올리면 해당 노트의 본문과 자산을 미리 fetch 합니다. 실제 클릭 시점에는 이미 캐시되어 있어 거의 즉시 표시됩니다. prefetch 는 viewport 안의 링크에만 적용되며, 모바일 환경에서는 자동으로 비활성화됩니다.

## 자주 묻는 질문

### Q. vault 전체를 발행하지 않을 수 있나요?

네, frontmatter `notedrop-publish: true` 가 있는 노트만 발행됩니다. 그 외 노트는 vault 안에만 존재합니다.

### Q. 비공개 노트가 실수로 공개될 위험은?

발행 직전 단계에서 대상 노트 목록을 미리 보여주는 confirm 다이얼로그가 있으며, 모든 발행 commit 은 plain text diff 로 target repo 에 남으므로 사후 추적이 가능합니다. 실수로 발행된 노트는 frontmatter 에서 `notedrop-publish` 를 제거하고 다시 발행하면 manifest 에서 빠집니다.

### Q. 이미지나 PDF 첨부도 발행되나요?

발행 노트에서 참조된 자산만 자동으로 함께 복제됩니다. 참조되지 않은 자산은 target repo 로 옮겨지지 않습니다.

### Q. 발행 repo 와 vault repo 를 동일하게 둘 수 있나요?

권장하지 않습니다. notedrop 은 발행 repo 의 `main` 브랜치를 자동으로 갱신하므로, vault 의 작업 commit 과 충돌할 수 있습니다. 별도의 발행 전용 repo 를 두는 편이 안전합니다.

### Q. GH Pages 가 아닌 정적 호스팅도 되나요?

네. 발행 결과물은 단순한 정적 자산이므로 Cloudflare Pages, Netlify, Vercel, S3 등 어떤 정적 호스팅에도 그대로 배포할 수 있습니다. 다만 자동 배포 워크플로는 직접 작성해야 합니다.

### Q. 검색은 어떻게 동작하나요?

발행 시 manifest 와 함께 본문 인덱스도 정적 JSON 으로 생성됩니다. 뷰어가 이 인덱스를 fetch 해 클라이언트에서 검색을 수행하므로 별도 서버가 필요 없습니다. 본문이 매우 큰 경우에는 인덱스가 무거워질 수 있으므로 향후 chunked index 도입을 검토 중입니다.

## 알려진 한계

- **양방향 동기화 없음**: notedrop 은 vault → 발행 repo 단방향입니다. 발행된 글을 다른 곳에서 수정한 결과를 vault 로 되돌리는 동기화는 지원하지 않습니다.
- **partial publish 미구현**: 현재는 매 발행이 manifest 전체를 갱신합니다. 변경된 노트만 골라 push 하는 점진적 발행은 다음 마일스톤에서 다룰 예정입니다.
- **댓글 / 좋아요 없음**: 정적 출력이므로 동적 인터랙션이 필요하다면 외부 위젯 (giscus 등) 을 customCss / customScript 로 끼워 넣어야 합니다.
- **다국어 라우팅**: 현재 단일 언어 기준으로만 인덱스가 만들어집니다. ko / en 분기는 frontmatter 의 `lang` 으로 임시 우회할 수 있습니다.

## 디자인 철학

### 단순함

발행 설정에는 PAT 와 target repo 두 개만 있어도 충분히 동작합니다. 기능을 늘릴 때마다 "이 기능이 첫 진입 사용자의 부담을 늘리지 않는가" 를 점검합니다.

### 가역성

언제든 발행을 멈출 수 있고, 멈추더라도 vault 는 손상되지 않습니다. target repo 를 통째로 지워도 다음 발행이 처음부터 다시 만들어 줍니다. 잘못된 발행은 frontmatter 한 줄 수정으로 되돌릴 수 있습니다.

### 정적 우선

런타임 서버를 두지 않습니다. 결과물이 정적이라는 약속은 호스팅 비용을 거의 0 에 가깝게 만들고, 가용성과 보안 부담도 낮춥니다.

### 옵시디언 기본값 존중

옵시디언이 이미 잘하는 것 (편집, 백링크, 그래프 등) 은 다시 만들지 않습니다. notedrop 은 "발행" 이라는 한 가지 역할에만 집중합니다.

## 기여 / 참고 자료

- 소스 저장소: <https://github.com/siakun/notedrop>
- 이슈·기능 제안: 위 저장소의 GitHub Issues
- 디자인 결정 기록: `docs/adr/`
- 마일스톤·아키텍처 문서: `docs/`

기여하기 전에 `docs/CONTRIBUTING.md` (작성 예정) 와 `docs/adr/` 의 최근 결정을 먼저 읽어 주시면 리뷰가 더 빨라집니다.

## 라이선스

MIT. 자세한 조건은 저장소의 `LICENSE` 파일을 참고해 주세요.

---

이 문서가 길게 펼쳐진다면 페이지네이션이 정상 동작하는 것입니다.
실제 발행이 시작되면 이 자리표시자는 사라지고 첫 노트가 그 자리에 표시됩니다.
