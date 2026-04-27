---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - arc42
  - cross-cutting
summary: 누설 방지 다층 방어, 에러 처리, 안전장치, race condition, UI 알림 등 횡단 관심사
---
# 09. Cross-cutting Concerns

여러 컴포넌트에 걸쳐 적용되는 관심사. 핵심 원칙: **vault 의 비공개 콘텐츠 누설 방지가 절대 1순위**. 그 다음 데이터 무결성, 그 다음 UX.

## 9.1 비공개 누설 방지 (다층 방어)

중첩 방어 - 한 layer 가 깨져도 다음 layer 가 차단.

| 레이어 | 무엇을 막는가 |
|---|---|
| **화이트리스트 강제** | `notedrop-publish: true` 없으면 PublishIndex 에 들어가지 않음. 발행 코드 경로에 진입 자체 X |
| **단일 소스 (PublishIndex)** | 모든 ref 해석은 PublishIndex 조회로만. 인덱스에 없으면 무조건 unpublished 처리 (안전장치 발동) |
| **Frontmatter sanitize** | public 출력 frontmatter 는 plugin 이 명시적으로 채우는 필드만 (notedrop-* 와 derive). vault frontmatter 의 다른 키는 유출되지 않음 |
| **본문 HIDE 적용** | `%%주석%%`, Waypoint 블록, vault frontmatter 영역 - 변환 단계에서 제거 |
| **발행 직전 재검증** | git push 직전 한 번 더 PublishIndex 조회. 시점 차이로 unpublished 됐으면 abort |
| **Public 레포 격리** | 2-레포 구조 자체가 하드 격리. private vault 레포에서 public 레포로 push 할 때만 누설 가능, 그 push 코드만 감사하면 됨 |
| **임시 작업 디렉터리는 vault 밖** | `os.tmpdir()/notedrop-work/` 사용. plugin 코드가 vault 디렉터리에 git add 하는 경로 자체가 없음 |

각 레이어마다 단위 테스트 의무:
- "publish flag 없는 노트는 어떤 경로로도 발행되지 않는다"
- "vault frontmatter 의 mood, # 주석 등은 public 출력에 안 들어간다"
- "publish 직전 unpublish 된 노트는 push 안 된다"
- "%% 안 콘텐츠는 출력에 어떤 형태로도 안 남는다"

## 9.2 발행 atomicity

발행 1회 = **content + manifest 함께 단일 commit**. 부분 적용 방지.

| 실패 지점 | 동작 |
|---|---|
| 변환 중 에러 (잘못된 frontmatter 등) | 임시 디렉터리 X, 인덱스 변경 X. 사용자에게 명확한 에러 메시지 (어느 파일, 어느 줄) |
| Git clone 실패 (네트워크·인증) | 명확한 에러. 재시도 안내. PAT 만료면 설정 화면으로 deeplink |
| Push 시 비-fast-forward (외부 수정) | 사용자에게 선택권: (a) Force-push 덮어쓰기 / (b) 취소 후 수동 해결. **default: 취소** |
| Push 실패 (네트워크) | 임시 디렉터리·인덱스 갱신 보존. "재시도" 명령어로 동일 작업 복구 |
| 부분 성공 (commit 됐으나 push 안 됨) | 다음 publish 가 자동으로 누적 push. status bar 에 표시 |

작업 디렉터리: `os.tmpdir()/notedrop-work/<session>/`. 옵시디언 종료 시 OS 가 청소 (또는 다음 세션 시작 시 stale 디렉터리 cleanup).

## 9.3 No-pull 정책

플러그인은 public 레포의 단독 writer 라는 전제. 매번 pull 은 vault 에서 derive 되는 상태를 외부 변경과 merge 하려는 시도라 모델이 안 맞음.

```
GitPublisher.publish:
  1. clone (없으면) - 첫 1회만 (workDir 비었을 때)
  2. 변경된 파일만 덮어쓰기 (incremental)
  3. commit + push (no pull)
  4. 비-fast-forward 시 → 사용자 선택권으로 force 또는 취소
```

상세: [decisions/0019-발행-push-only-no-pull.md](decisions/0019-발행-push-only-no-pull.md)

## 9.4 Race condition

| 시나리오 | 처리 |
|---|---|
| 발행 중 vault 파일 수정 | publish 시작 시 snapshot 시점 고정. 그 후 변경은 다음 publish 에 |
| 동시 publish 호출 (여러 명령어 빠르게) | publish 함수에 mutex - serialize. 두 번째 호출은 첫 번째 끝날 때까지 await |
| Live server SSE 송신 중 PublishIndex 갱신 | PublishIndex 조회는 atomic (Map). 송신 중인 데이터는 호출 시점 snapshot |
| 외부 git 수정과 publish 충돌 | Push 시 detect → 9.2 의 충돌 처리 |
| 빠른 연속 vault 수정 (자동저장) | SSE 송신 디바운스 (200ms) - 마지막 변경만 전파 |

## 9.5 엣지 케이스

| 케이스 | 처리 |
|---|---|
| 임베드 재귀 (`A → B → A`) | depth limit = 1. 초과 시 "(임베드 깊이 초과)" placeholder |
| Hash 충돌 | 발행 시점에 PublishIndex.get(hash) 검사. 이미 있으면 재생성 |
| 큰 이미지 (>10MB) | 거부 + 경고. (GitHub 100MB 파일 한도 보호) |
| 잘못된 frontmatter (`notedrop-render: "weird"`) | 무시 + 경고. 폴백으로 자동 추정 |
| 자산 파일 누락 (`![[missing.png]]`) | 본문에 placeholder + warnings 에 기록. 발행은 계속 |
| localhost 포트 점유 (7777 사용 중) | 7777 → 7778 → ... → 7800 자동 fallback. 사용자에게 실제 포트 알림 |
| CSS 위험 패턴 (`@import`, 외부 `url()`) | 자동 strip. 경고 로그 |
| slug 충돌 (두 페이지 같은 slug) | 두 번째는 `<slug>-2` 자동 부여 + 경고 |
| 부모 책 unpublish 됐는데 챕터 publish 시도 | 챕터를 단독 doc 으로 폴백 + 경고 |
| vault 파일 삭제 | `vault.on('delete')` 자동 unpublish |
| vault 파일 rename | hash·published 상태 유지. filePath 만 갱신 |
| PAT 권한 부족 (push 403) | 명확한 메시지: "PAT 가 repo 권한이 있는지 확인하세요" + 설정 deeplink |
| Manifest version 불일치 (구버전 뷰어가 신버전 manifest 받음) | 경고 표시 + 가능한 만큼 처리 |
| customCss 파일 없음 (`notedrop-css-file: 없는경로.css`) | 무시 + 경고. 빈 CSS 로 처리 |

## 9.6 UI 알림 패턴

| 상황 | 채널 |
|---|---|
| 발행 성공 | `Notice("✓ 발행 완료. URL 클립보드 복사됨")` 3초 |
| 발행 실패 (사용자 조치 필요) | `Notice("⚠ 발행 실패: <이유>", 0)` 무기한 + 설정 deeplink |
| 변환 경고 (publish 성공이지만 누락) | `Notice("⚠ 1건 경고: <상세는 콘솔>", 5초)` |
| 라이브 서버 상태 | status bar 우측 `▶ Notedrop :7777` 또는 `■ Notedrop` |
| 디버그 상세 | `console.log("[notedrop] ...")` |
| Force-push 동의 요청 | Modal: "외부에서 수정된 commit 이 있습니다. 덮어쓸까요? (취소 권장)" |

치명적이지 않은 경고는 발행 자체를 막지 않음 - 작가가 빠르게 반복하는 워크플로 보호.

## 9.7 안전장치 요약 표

| 누설 종류 | 방지 메커니즘 |
|---|---|
| 비공개 노트 본문 직접 발행 | 화이트리스트 (notedrop-publish 필수) |
| 비공개 노트 임베드로 누설 | "접근할 수 없는 문서" placeholder |
| 비공개 노트명 위키링크로 누설 | alias 있으면 alias 만, 없으면 노트명 + "(접근 권한이 없습니다)" 빨간 dead link |
| Vault frontmatter 메타 누설 | 출력 frontmatter 는 plugin 이 명시적으로 채우는 필드만 |
| `%%주석%%` 누설 | 변환 단계 HIDE |
| Waypoint·MOC 내부 링크 누설 | %% 안 또는 chapter list 추출용으로만 사용 |
| YAML 주석 (`# source:`) 누설 | frontmatter 자체가 출력 안 되니 자동 |
| Vault 다른 폴더 우연한 commit | 작업 디렉터리는 vault 밖 |
| Plugin 설정 (PAT) 누설 | `.obsidian/plugins/notedrop/data.json` 에만 보관, 콘솔·에러 노출 X |
| Public 레포 외부 수정으로 인한 inject | Push 충돌 시 default 취소 |
| CSS 외부 자원 fetch | sanitize 단계 strip |

## 9.8 보안 점검 체크리스트 (release 전)

- [ ] PAT 가 어떤 콘솔 출력·에러 메시지·로그 파일에도 노출 안 됨
- [ ] vault 의 어떤 파일이 plugin 코드 경로에서 vault 외부로 복사·전송될 때마다 화이트리스트 검사 통과
- [ ] manifest.json·content/<hash>/index.md 출력에서 `notedrop-*` 와 derive 외 frontmatter 키 0건
- [ ] `%%` 안 콘텐츠가 어떤 출력에도 0건
- [ ] CSS sanitize: `@import`, `expression()`, 외부 `url()` 모두 strip 검증
- [ ] PAT 가 `.obsidian/plugins/notedrop/data.json` 외 어디에도 없음
- [ ] vault gitignore 에 `.obsidian/plugins/notedrop/data.json` 안내 (사용자 onboarding 가이드)
