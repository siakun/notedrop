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

이 페이지는 발행된 노트가 없을 때 보여지는 자리표시자입니다.
플러그인의 **Publish vault to GitHub** 명령을 실행하면 manifest 가 갱신되며 이 페이지는 사라집니다.

## 빠른 시작

1. Obsidian 에서 BRAT 으로 notedrop 설치
2. Settings → Notedrop 탭에서 GitHub PAT, target repo 설정
3. 발행할 노트의 frontmatter 에 `notedrop-publish: true`
4. Settings → Notedrop → Publish 버튼 또는 Command palette → `Notedrop: Publish vault to GitHub`
5. GH Actions deploy 가 1~2분 안에 정적 뷰어를 갱신
