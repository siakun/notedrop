---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
  - publish
  - m3
summary: 발행 메커니즘을 isomorphic-git clone/push 가 아닌 GitHub Git Data Tree API 로 결정. 로컬 클론 미보유 + 단일 atomic commit 가능
---
# ADR-0027: 발행 메커니즘 = GitHub Git Data Tree API (isomorphic-git 미사용)

- **Status**: Accepted (2026-04-26)
- **Supersedes**: spec §5.1 / §5.4 의 IsomorphicGitClient 항목
- **Superseded by**: -

## Context

spec 은 발행 메커니즘으로 isomorphic-git 가정 (`plugin/src/infrastructure/IsomorphicGitClient.ts`, `GitClient` port 시그니처 = clone/add/commit/push). M3 단계에서 실 구현 시 비교:

| 옵션 | 로컬 디스크 | 의존 사이즈 | atomic commit | 인증 | 호환 OS |
|---|---|---|---|---|---|
| A. isomorphic-git | 클론 디렉터리 필요 (~MB 단위) | + ~700KB JS | 가능 | PAT (custom http) | 데스크톱 + 웹 |
| B. ChildProcessGitClient | 시스템 git 필수 + 클론 디렉터리 | 0 | 가능 | git credential helper | 데스크톱 only |
| C. GitHub Contents API (per-file PUT) | 0 | 0 | X (파일별 commit) | PAT (Bearer) | 모든 환경 |
| D. GitHub Git Data Tree API (blob → tree → commit → ref) | 0 | 0 | O (단일 commit, N파일) | PAT (Bearer) | 모든 환경 |

본 프로젝트의 publish 패턴:
- 1회 publish 당 N 파일 (책 1권 ≈ chapters * (1 .md + ≤ K assets) + 1 manifest)
- N = 수십~수백
- 사용자가 수동 trigger 후 결과 한 번에 보임 → atomic commit 강한 선호
- 옵시디언 데스크톱 plugin (Electron, fetch 가능)
- vault 와 publish 대상이 별도 repo (ADR-0001) 라 클론 디렉터리는 plugin 만 쓰는 임시 공간

## Decision

**옵션 D (GitHub Git Data Tree API) 채택**.

### 시퀀스

1. `GET /repos/{owner}/{repo}/git/refs/heads/{branch}` — 현재 브랜치 head sha
2. `GET /repos/{owner}/{repo}/git/commits/{sha}` — head commit 의 tree sha (parent_tree)
3. 각 파일마다 `POST /repos/{owner}/{repo}/git/blobs` — text 는 utf-8, binary 는 base64. blob sha 회수
4. `POST /repos/{owner}/{repo}/git/trees` — `{base_tree: parent_tree, tree: [{path, mode: '100644', type: 'blob', sha: blob_sha}, ...]}` → 새 tree sha
5. `POST /repos/{owner}/{repo}/git/commits` — `{message, tree: new_tree, parents: [head_sha]}` → 새 commit sha
6. `PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}` — `{sha: new_commit, force: false}` → 브랜치 ref 갱신

= N+5 API 호출 (3 + N + 3). 하나의 atomic commit. base_tree 사용으로 `viewer/public/` 외 파일은 영향 X.

### 인증

PAT (fine-grained, contents:write 권한). `Authorization: Bearer <token>` 헤더. 콘솔/UI 노출 금지 (spec §9.7).

### 에러 분기

- 401/403 → `GitHubAuthError` (PAT 만료·권한 부족 메시지)
- 그 외 → `GitHubApiError(status, message)`
- Notice 로 사용자에게 표시, 콘솔에는 stack trace 남김

## Consequences

긍정:
- **로컬 클론 디렉터리 불필요** — 옵시디언 vault 외부에 임시 디렉터리 안 만듬 (vault 사이드카 금지 ADR-0018 정신)
- **atomic commit** — 부분 push 실패 시 이전 head 그대로, 일관성 보장
- **base_tree 활용** — viewer/public 외 파일 (소스, README, .github 등) 자동 보존, force-push 위험 0
- **번들 크기 0 추가** — fetch 사용, 새 라이브러리 의존 X (esbuild 산출물 ~170KB 유지)
- **Windows·Linux·Mac 동일 동작** — 로컬 git 미설치 환경도 OK
- **테스트 용이** — fetch mock 만으로 통합 테스트 가능 (실 git 디렉터리·http 서버 불필요)

부정:
- **rate limit 의존** — PAT 인증 시 5000/hr. 1 publish ≈ 100 호출 가정 시 시간당 50회 발행 가능. 본인 dogfood 단계에선 충분, 다중 사용자 시 재평가
- **5MB 이상 단일 파일 제한** — Git Data API 의 blob 크기 한계 (Tree API 는 100MB GitHub 한계, blob API 는 100MB 까지 OK 하지만 base64 인코딩 + 메모리 부담). 책 자산이 5MB 이상이면 LFS 가 적합한 영역
- **`force: false` 라 동시 발행 충돌** — 두 세션이 같이 publish 시 두 번째는 ref 갱신 실패 → 사용자에게 retry. M5 polish 에서 Notice 로 명확히
- **history 노이즈** — 발행마다 1 commit (변경 없는 파일 포함하면 안 되므로 diff 비교 로직 추가 검토 필요). 현재는 항상 N 파일 모두 push, idempotent 라 트리는 같으면 빈 commit 가능성. base_tree + 동일 blob sha 면 GitHub 가 중복 제거하나 commit 자체는 생성됨 → v2 에서 변경 감지 후 skip 추가 가능

## Alternatives Considered

### A. isomorphic-git

긍정: spec 원래 선택, 진짜 git 동작
부정:
- ~700KB 의존 (esbuild 산출물 5x 증가)
- 클론 디렉터리 관리 (어디 저장할지, 사용자가 옵시디언 종료 후 잔여물 처리, conflict 해결 UI 등)
- 첫 publish 전 clone 비용 (큰 repo 면 수십 초)

### B. ChildProcessGitClient

긍정: 의존 0, 진짜 git
부정: 사용자가 git 설치 + PATH 설정 의무. Windows 사용자 friction 큼

### C. GitHub Contents API (per-file)

긍정: API 사용 단순 (PUT 한 번에 파일 1개)
부정:
- 파일마다 commit → history 노이즈 큼 (책 1권 = 수백 commit)
- atomic 보장 X
- rate limit 빠르게 소진

## 향후 진화

- 변경 감지 (이전 manifest 와 비교) → 변경 없는 파일 blob 호출 skip → 일반 publish 시 N 호출을 K 호출로 감소
- LFS 통합 (5MB 이상 자산) — 별도 ADR
- 다른 호스팅 (GitLab, Gitea) → port 계층 (`RemotePublisher` 인터페이스) 추가 후 어댑터 분리

## Related

- ADR-0019: 발행 push only, no pull (본 결정과 정합 — pull 안 하니 base_tree 만 보존하면 됨)
- ADR-0001: 2-repo 구조 (vault private + notedrop public)
- ADR-0018: vault 사이드카 금지 (클론 디렉터리 회피와 같은 motivation)
- spec §5.1, §5.4 의 IsomorphicGitClient 항목 (본 ADR 이 부분 supersede)
- spec §9.7 PAT 노출 금지
- 외부: [GitHub Git Data API](https://docs.github.com/en/rest/git)
