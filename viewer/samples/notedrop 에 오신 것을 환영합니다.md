---
notedrop-publish: true
notedrop-slug: welcome
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

---

이 문서가 길게 펼쳐진다면 페이지네이션이 정상 동작하는 것입니다.
실제 발행이 시작되면 이 자리표시자는 사라지고 첫 노트가 그 자리에 표시됩니다.
