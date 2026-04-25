---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: 발행 = 단순 push only. pull 없음 (single-writer 가정). 충돌 시 사용자 선택 (force 또는 취소). single commit atomicity
---
# ADR-0019: 발행 = push only (no pull), 단일 commit atomicity

- **Status**: Accepted (2026-04-26)

## Context

플러그인이 public 레포에 발행할 때 git 작업 흐름 결정 필요.

전통적인 git 워크플로:
```
1. clone (또는 pull)
2. 변경 적용
3. add + commit
4. pull (rebase/merge)
5. push
```

매번 pull 은 외부 변경과 merge 시도. 우리 케이스에선:
- 플러그인이 public 레포의 *단독 writer*
- public 레포 상태는 vault 에서 fully derive
- 외부 수정은 예외 케이스 (사용자가 GitHub 웹 UI 로 README 만지는 등)

사용자 지적: *어차피 올리기만 할건데 pull 이 필요한가?*

## Decision

### 정상 흐름 = push only (no pull)

```
GitPublisher.publish:
  1. clone (없으면) - 첫 1회만 (workDir 비었을 때)
  2. 변경된 파일만 덮어쓰기 (incremental)
  3. add + commit + push (no pull)
  4. 비-fast-forward 시 → 사용자 선택권:
     a. Force-push (덮어쓰기) - 명시적 동의 필요
     b. 취소 후 수동 해결 - default 추천
```

매번 pull 안 함. 정상 흐름은 단순.

### Atomicity = single commit

발행 1회 = **content + manifest 함께 단일 commit**.

- 변환된 markdown 파일 + 자산 + 갱신된 manifest 가 한 번에 commit
- 부분 적용 (content 만 push, manifest 안 됨) 방지
- commit 메시지: `"[notedrop] Update <slug-or-hash>"` 또는 `"[notedrop] Publish <slug>"`

### 작업 디렉터리 = vault 밖

`os.tmpdir()/notedrop-work/<session-id>/` 사용. vault 안에 git 작업 디렉터리 없음. 옵시디언 종료 시 OS 가 청소 (또는 다음 세션 시작 시 stale 디렉터리 cleanup).

### 충돌 처리 (비-fast-forward)

`git push` 가 비-fast-forward error 반환하면:

1. 변경 detection: 외부 commit 이 push 후에 들어옴
2. 사용자에게 modal 표시:
   - 옵션 A: "Force-push (덮어쓰기)" - 외부 commit 이 lost
   - 옵션 B: "취소" - default, 사용자가 수동 해결
3. A 선택 시 `git push --force-with-lease` (안전장치 - push 직전 remote 가 우리가 본 상태와 같을 때만)
4. B 선택 시 alert 후 종료

### Push 실패 처리 (네트워크 등)

- 임시 디렉터리·인덱스 갱신 *보존*
- "재시도" 명령어로 동일 작업 복구 가능
- status bar 에 "마지막 publish 실패" 표시

### 동시 publish 호출

`GitPublisher.publish` 에 **mutex** 적용. 두 번째 호출은 첫 번째 끝날 때까지 await. 빠른 연속 명령어가 race condition 일으키지 않음.

## Consequences

긍정:
- 정상 흐름 단순 (clone + write + commit + push)
- 매번 pull 비용 (네트워크·시간) 절감
- mental model 명확: vault 가 source, public 레포는 mirror
- 충돌은 예외 케이스로만 처리

부정:
- 외부 commit (GitHub 웹 UI 수정 등) 이 발생하면 force-push 위험
- 사용자가 README 등을 GitHub 웹에서 수정 시 다음 publish 와 충돌 - 명시적 동의 필요

## Alternatives Considered

### 1. 매번 pull → push

거부 사유:
- 단일 writer 가정에서 pull 은 over-engineering
- pull 이 cleancommit hash 변경을 만들 수 있어 (rebase) cache invalidation 복잡

### 2. 항상 force-push (조용히)

거부 사유:
- 외부 commit (실수든 의도든) 을 silently 덮어쓰기 → 데이터 손실
- 사용자 신뢰 X

### 3. Force-push 옵션 X (충돌 시 무조건 사용자 수동 해결)

거부 사유:
- 사용자가 git 잘 모를 수 있음
- 명시적 force 옵션이 한 번 클릭으로 해결 가능 (위험 인지 모달과 함께)

### 4. 매 publish 마다 squash·force-push

거부 사유:
- 발행 이력 (history) 손실
- 어느 시점에 무엇이 발행됐는지 추적 어려움

## Force-push 의 안전장치

`git push --force-with-lease` 사용:
- push 시점에 remote 가 마지막으로 본 commit hash 와 같을 때만 force
- 다른 사람이 추가 commit 했으면 force 도 reject (덮어쓰기 방지)
- 일반 force 보다 안전

추가 안전장치:
- modal 에 "외부에서 수정된 commit N 개가 lost 됩니다. 계속할까요?" 명시
- 외부 commit 들의 메시지 미리보기

## Pull 이 필요한 시나리오 (예외)

다음 경우는 사용자가 명령어 명시적 호출:
- `Notedrop: Sync from remote` - pull 후 로컬 캐시 갱신
- 사용자가 GitHub 웹 또는 다른 도구로 public 레포 수정 후

기본은 push only. pull 은 예외 명령어.

## Related

- [ADR-0001](0001-2-레포-구조.md) (2-레포 구조 - single writer 전제)
- [09-cross-cutting.md](../09-cross-cutting.md) 9.2 (atomicity), 9.4 (race condition)
