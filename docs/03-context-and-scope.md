---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - arc42
  - context
summary: 시스템 컨텍스트 다이어그램, 외부 인터페이스, in-scope·out-of-scope 명세
---
# 03. Context and Scope

## 3.1 시스템 컨텍스트

```
┌────────┐                         ┌─────────────────────┐
│ Author │ ─── 편집 ──────────────▶ │ Obsidian Vault      │
│ (사용자) │                         │ (private 레포)       │
└────────┘                         └────────┬────────────┘
     │                                      │ 읽기·이벤트
     │ 명령어·UI                              ▼
     │                              ┌─────────────────────┐
     │ ◀──── 클립보드·알림 ────────── │ notedrop Plugin      │
     │                              │ (옵시디언 안에서 동작)│
     │                              └────┬────────────┬───┘
     │                                   │            │
     │                          로컬 HTTP │            │ git push
     │                                   ▼            ▼
     │                          ┌────────────┐ ┌────────────────┐
     │ 브라우저 ──── 미리보기 ───▶│ localhost  │ │ Public 레포    │
     │              (라이브)     │ :7777      │ │ siakun/notedrop│
     │                          └────────────┘ └────────┬───────┘
     │                                                  │ trigger
     │                                                  ▼
     │                                         ┌─────────────────┐
     │                                         │ GitHub Actions  │
     │                                         │ (정적 파일 deploy)│
     │                                         └────────┬────────┘
     │                                                  │
     │                                                  ▼
     │                                         ┌─────────────────┐
┌────┴────┐                                    │ GitHub Pages    │
│ Reader  │ ◀────────── HTTP 요청 ─────────────│ siakun.github.io│
│ (독자)   │                                    │ /notedrop/...   │
└─────────┘                                    └─────────────────┘
```

## 3.2 외부 시스템 / 인터페이스

| 외부 시스템 | 인터페이스 | 방향 | 데이터 |
|---|---|---|---|
| 옵시디언 (Vault FS) | Obsidian Plugin API (`app.vault`) | 양방향 | 파일 read·write, 폴더 listing |
| 옵시디언 (MetadataCache) | Obsidian Plugin API (`app.metadataCache`) | 읽기 + 이벤트 구독 | frontmatter, 헤딩, 링크 인덱스 |
| 옵시디언 (UI) | `Plugin.addCommand`, `addSettingTab`, `addStatusBarItem`, `Notice` | 출력 | 명령어, 설정 UI, 알림 |
| Node.js (Electron) | `require('http')`, `require('fs')`, `os.tmpdir()` | 양방향 | 로컬 HTTP 서버, 임시 작업 디렉터리 |
| Git (CLI 또는 isomorphic-git) | git clone / add / commit / push | 출력 | public 레포에 변환된 콘텐츠 push |
| GitHub API | HTTPS + PAT 인증 | 양방향 (간접) | git push 시 인증, 레포 존재 검증 (선택) |
| 브라우저 (작가, 독자) | HTTP / SSE | 양방향 | manifest, content, /__events 스트림 |
| GitHub Actions (release.yml, 본 repo) | tag push 트리거 | 출력 | plugin build + viewer 자산 zip 인라인 → release asset |
| GitHub Actions (share repo, 사용자 자율) | (선택) push 트리거 | 출력 | share repo 가 *Deploy from a branch* 모드로 직접 호스팅 또는 사용자가 자체 deploy 워크플로 추가 |
| GitHub Pages (share repo) | HTTPS 정적 파일 서빙 | 출력 | viewer 자산 + content + manifest.json (plugin publish 가 push) |

## 3.3 사용자 역할

| 역할 | 누구 | 무엇을 함 |
|---|---|---|
| Author (작가) | 사용자 본인 | 옵시디언에서 노트·책 집필. 발행 명령어 실행. 라이브 미리보기로 검토. 설정 관리 |
| Reader (독자) | 외부 인터넷 사용자 | 발행된 URL 접속. 책 읽기, 페이지 사이즈 조절, PDF 다운로드. 댓글·로그인 X (MVP) |
| Maintainer (유지보수) | 사용자 본인, 미래에는 OSS contributor | 플러그인·뷰어 코드 수정, 새 옵시디언 문법 지원 추가 |

## 3.4 In-Scope (이 프로젝트가 다룬다)

- 옵시디언 vault 노트·책 → public 마크다운 + 자산 변환
- 책 식별·챕터 추출 (Waypoint 패턴 + 폴백)
- 위키링크·임베드·콜아웃·수식·Mermaid·이미지 렌더 (옵시디언 코어 문법)
- 미발행 ref 안전장치 (위키링크 dead link, 임베드 placeholder)
- frontmatter HIDE, 비-`notedrop-*` 키 누설 차단
- manifest.json 카탈로그 생성·갱신
- 페이지네이션 (paged.js, A3 ~ B6)
- PDF 다운로드 (브라우저 print)
- 페이지별 customCss
- 라이브 미리보기 (로컬 HTTP + SSE)
- Git push 발행 (incremental, push only)
- 설정 UI (PAT, 타겟 레포, 포트, 자동 시작 토글)
- 명령어 (Share, Unshare, Start preview, Stop, Clear cache, Open shared list)
- TDD 테스트 (Domain layer)

## 3.5 Out-of-Scope (이 프로젝트가 다루지 않는다)

### 명시적 v2 후보 (영구 제외 아님, 현 시점 미수행)

- 댓글·피드백 위젯 (Giscus 등)
- 검색 (Lunr.js)
- 다크 테마
- 가로 모드 페이지
- 사용자 정의 폰트 업로드
- 챕터별 개별 publish 토글 (책 entry 통일)
- Excalidraw embed
- og 태그·SEO 보조 prerender
- 비-이미지 자산 (PDF, ZIP)
- Dataview 사전 렌더 (PASSTHROUGH 만)
- 노트 임베드 재귀 깊이 > 1
- 모바일 옵시디언 publish (제한적)
- 옵시디언 community plugins 마켓 등록
- 다국어 (한국어 외 UI)

### 영구 비-목표

- 백엔드·DB·인증·결제
- 실시간 협업 (CRDT 등)
- 클라우드 노트 동기 (옵시디언 Sync 가 별도 존재)
- 노션·Obsidian Publish 의 그래프·백링크 위젯

## 3.6 외부 의존 위험 정리

| 의존 | 위험 | 대응 |
|---|---|---|
| GitHub Pages 무료 티어 정책 변경 | 호스팅 막힘 | 정적 파일 형태라 다른 정적 호스팅 (Netlify, Cloudflare Pages, Vercel) 으로 즉시 이전 가능 |
| 옵시디언 Plugin API 호환 깨짐 | 플러그인 작동 X | minAppVersion 명시, 메이저 옵시디언 버전 변경 시 회귀 테스트 |
| paged.js 유지보수 중단 | 페이지네이션 불가 | 대안 라이브러리 (`react-pageflip` 등) 또는 자체 구현. 마크다운 자체는 보존되니 콘텐츠 손실 X |
| Next.js 메이저 변경 | 뷰어 빌드 깨짐 | Static export 패턴 자체는 안정적. 메이저 업그레이드 시 회귀 테스트 |
| GitHub PAT 만료 | publish 실패 | 명확한 에러 메시지, 갱신 가이드 |
