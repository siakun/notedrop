---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: 라이브 미리보기 = Node http 서버 + SSE. npm run dev 시뮬 X. 뷰어는 빌드된 정적 파일 그대로
---
# ADR-0014: 라이브 미리보기 = Node http 서버 + SSE

- **Status**: Accepted (2026-04-26)

## Context

작가가 옵시디언에서 편집 → 브라우저에서 즉시 보임 (라이브 미리보기) 가 핵심 UX.

사용자 의문: *플러그인이 `npm run dev` 같은 걸 시뮬레이션 해야 하나?*

`npm run dev` (= `next dev`) 가 하는 일:
1. webpack 모듈 번들러 (JS/TS 컴파일)
2. HMR (Hot Module Replacement) - 코드 변경 시 모듈 핫스왑
3. 소스맵, 타입 체크, dev-only 경고
4. dev 서버 (HTTP)

이 중 1~3 은 *뷰어 코드 변경* 대응. 우리 미리보기에서 변하는 건 *콘텐츠* 뿐. 그래서 webpack/HMR/dev 빌드 불필요.

옵시디언 플러그인이 Node http 서버를 띄울 수 있는가? - Yes (Electron 환경, Node stdlib 접근). 선례: [Local REST API 플러그인](https://github.com/coddingtonbear/obsidian-local-rest-api).

## Decision

**Node `http` 모듈로 200줄짜리 HTTP 서버 + SSE**. 빌드 파이프라인 시뮬레이션 X.

플러그인 동작:
```
플러그인 켜지고 "Start preview" 명령어:
  1. http.createServer() 로 localhost:7777
  2. 라우팅:
     GET  /                  → 번들된 뷰어 정적 파일 (out/index.html 등)
     GET  /content/<hash>    → vault 에서 변환해서 응답
     GET  /manifest.json     → 현재 vault 상태 카탈로그
     GET  /__events (SSE)    → 파일 변경 알림 스트림

파일 변경 감지:
  app.vault.on('modify', file)
    → MetadataCache 자동 갱신
    → VaultEventBridge → PublishIndex 갱신
    → SSE 푸시: { type: 'changed', hash: 'aB3xK9' }
    → 브라우저가 해당 콘텐츠만 다시 fetch (페이지 새로고침 X)
```

뷰어 (Static SPA, [ADR-0011](0011-static-spa.md)) 가 `EventSource('/__events')` 로 구독. dev 모드 분기 없이 prod 빌드도 같은 코드 - prod 에선 `/__events` 가 없어 silently 실패.

## Consequences

긍정:
- 단순 (HTTP 서버 + SSE 만, 200~300줄 코드)
- 빌드·HMR·webpack 없음
- 옵시디언 (Electron) 환경 친화 (Node stdlib 만 사용)
- 데스크톱 옵시디언에서 작동
- prod 빌드 코드와 dev 코드 같음 (prod 에선 `/__events` 가 silently 실패)

부정:
- 모바일 옵시디언 미지원 (Node http 모듈 제한)
- 포트 점유 (default 7777). 충돌 시 fallback (7778, 7779, ...)
- 옵시디언 종료 시 서버도 종료 (자동, onunload 에서 close)

## 모바일 caveat

옵시디언 Mobile (iOS/Android) 은 Node API 풀세트 미지원. 라이브 미리보기는 데스크톱 only. 단:
- 발행 (git push) 도 Node API 의존이라 모바일 publish 도 어려움
- 작가 워크플로는 거의 데스크톱이라 실용상 손실 작음
- 모바일에선 옵시디언으로 편집 → 동기 → 데스크톱 켜면 publish

`manifest.json` 의 `isDesktopOnly: true` 명시.

## Alternatives Considered

### 1. `npm run dev` 시뮬 (Next.js dev 서버 안에 띄움)

거부 사유:
- 플러그인 안에 Next.js 번들 = 폭발적 크기 (수십 MB)
- 빌드 파이프라인 운영 비용
- 옵시디언 환경에서 안티 패턴 ([ADR-0010](0010-approach-a-markdown-first.md) Approach C 와 같은 거부 이유)

### 2. WebSocket 으로 SSE 대신

거부 사유:
- 단방향 (서버 → 브라우저) 만 필요. WebSocket 은 양방향 (과잉)
- SSE 는 HTTP 위에서 작동, 단순

### 3. Polling

브라우저가 일정 간격으로 `/__events` 또는 `/manifest.json` 요청.

거부 사유:
- 트래픽 낭비
- 변경 감지 지연

### 4. 옵시디언 내부 webview 로 띄움 (HTTP 서버 X)

옵시디언 안에 iframe 또는 modal 로 뷰어 표시.

거부 사유:
- 외부 브라우저에서 보고 싶은 경우 (예: 큰 모니터, 다른 디바이스) 불가
- "production 사이트와 같은 환경" 시각화 안 됨

## SSE 이벤트 형식

```
event: changed
data: {"hash":"aB3xK9","type":"content"}

event: changed
data: {"hash":"aB3xK9","type":"manifest"}

event: removed
data: {"hash":"aB3xK9"}
```

브라우저:
```ts
const sse = new EventSource('/__events')
sse.addEventListener('changed', (e) => {
  const { hash, type } = JSON.parse(e.data)
  if (type === 'content') contentClient.invalidate(hash)
  if (type === 'manifest') manifestClient.invalidate()
})
```

prod 에서는 `/__events` 가 없어 EventSource 가 실패 → LiveReloadProvider 가 try-catch.

## 외부 에디터로 vault 수정해도 작동하는가

Yes. 옵시디언은 파일시스템 워처 (chokidar 비슷) 로 vault 변경을 감지. VSCode, Vim, git pull 등 어느 출처든 mtime 변화 → MetadataCache 재파싱 → `changed` 이벤트 발행. 플러그인은 출처 신경 안 씀.

## Related

- [ADR-0011](0011-static-spa.md) (Static SPA - 같은 코드 dev/prod)
- [ADR-0015](0015-미리보기-시작-수동.md) (시작 방식)
- [06-runtime-view.md](../06-runtime-view.md) 6.2 (라이브 미리보기 시퀀스)
- 외부: [Local REST API 플러그인](https://github.com/coddingtonbear/obsidian-local-rest-api)
