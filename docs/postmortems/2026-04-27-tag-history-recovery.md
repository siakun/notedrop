---
date: 2026-04-27
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - postmortem
  - git
  - tag
  - history
summary: 비표준 한국어 어휘 일괄 정정 commit 이 git history root 부터 모든 SHA 변경 → 51 lightweight tag 가 main 과 분리. timestamp 매핑 + lightweight → annotated tag 전환으로 100% 회복. release.yml 의 manifest paths trigger 가 tag 재작성에 무반응 (release 중복 0)
---

# notedrop tag history recovery — 51 tag 의 매핑 회복

## 1. Executive Summary

LLM Context Rot 가드 메모리 적용 후 사용자가 git history 의 *비표준 한국어
어휘 일괄 정정* 진행. filter-branch 또는 rebase --root 같은 history-rewrite
도구가 root commit 부터 모든 commit message + 일부 코드 정정 → 모든
commit SHA + tree hash 변경.

본 repo 의 51 lightweight tag (0.0.1, 0.1.0~0.1.49 의 일부, m1-domain-complete
+ -en-backup) 가 모두 옛 SHA 를 가리킨 채 main 과 분리. `git log --oneline
--decorate` 에서 main 의 어떤 commit 도 tag decoration 미표시.

회복 작업:
1. 옛 tag 매핑 — *tree hash 매칭* (commit message 만 변경 시 유효) 실패
   (코드 변경 동반 → tree hash 다름)
2. *timestamp 매칭* (author/committer date 가 git history rewrite 의
   default 동작으로 보존) 으로 100% 매핑 성공
3. lightweight tag → annotated tag 전환 (`git tag -a <name> -m "release v<X>"`)
4. local + origin 양쪽의 옛 tag 삭제 + 새 tag push

release.yml 의 manifest paths trigger 가 tag push 와 무관 → release
중복 작성 0.

## 2. Background — 정정 commit 의 영향

### 2.1 LLM Context Rot 가드 적용

사용자 결정 (별도 세션): LLM 의 비표준 한국어 어휘 (영어 직역 동사 차용 등) 가
*프로젝트 내부 문서/코드/commit message* 에 누적되면 후속 LLM 세션의
context rot 발생. 가드 메모리 적용 + 기존 누적분 일괄 정정.

정정 commit (`dd63193 📝 docs(lang): 비표준 한국어 어휘 일괄 정정 — LLM
Context Rot 가드 적용`) 의 효과:
- 모든 commit message 에서 비표준 어휘 → 정상 한국어 교체
- 일부 source code (주석 + 문자열) 의 어휘도 정정
- 결과: git history 의 모든 commit 이 message 또는 tree 변경 → 모든
  SHA 변경

### 2.2 lightweight tag 의 함정

본 repo 의 모든 tag 가 *lightweight* (`type=commit`, tagger 미등록):
```
0.1.40 → 옛 SHA (commit object 에 직접 ref)
```

annotated tag (`type=tag`) 와 달리 *별도 tag object 없음* — `<name>` →
`<commit SHA>` 직접 매핑. commit SHA 변경 시 tag 도 재작성 의무.

`push.followTags` 옵션도 *annotated tag 만* 자동 push — lightweight 는
영향 0.

### 2.3 사용자가 발견한 증상

사용자 발화: "기존 main에서 버저닝 태그 정보가 다 빠졌습니다."

진단 결과:
```bash
$ git log --oneline --decorate -10
2ad2fbb (HEAD -> main, origin/main) ✨ feat(skill): notedrop-dogfood-automation skill 정의 추가
dd63193 📝 docs(lang): 비표준 한국어 어휘 일괄 정정 — LLM Context Rot 가드 적용
d734a86 🐛 fix(plugin): v0.1.49 — esbuild zip 의 실제 cross-platform deterministic 회복
a284d25 📝 docs(handoff): v0.1.48 자율 세션 기록 — viewer sync 누락 fix
e3a107f ✨ feat(plugin): v0.1.48 — viewer fingerprint mismatch Notice ...
```

**main 의 어떤 commit 위에도 tag decoration 표시 0**. tag 객체는 모두
옛 SHA 를 가리키지만 그 SHA 들은 main 의 ancestor 가 아닌 *고립된 commit
graph* 에 잔존.

## 3. 매핑 시도 1 — tree hash (실패)

### 3.1 가설

`git filter-branch` 가 *commit message 만* 변경하면:
- commit object 변경 → SHA 변경
- tree object 동일 (*content 변경 없음*)

따라서 옛 commit 의 tree hash 와 main 의 동일 tree hash 의 commit 이
1:1 매핑.

### 3.2 구현

```bash
> /tmp/tag_tree_map.txt
while IFS='|' read -r tag sha state subject; do
  if [ "$state" = "OUT" ]; then
    tree=$(git log -1 --format='%T' "$sha")
    echo "$tag|$sha|$tree" >> /tmp/tag_tree_map.txt
  fi
done < /tmp/tag_old_map.txt

git log main --format='%H %T' | tac > /tmp/main_tree_idx.txt

while IFS='|' read -r tag old_sha old_tree; do
  new_sha=$(grep " $old_tree$" /tmp/main_tree_idx.txt | head -1 | awk '{print $1}')
  ...
done
```

### 3.3 결과

```
matched: 0
unmatched: 34
```

**매핑 0%**. 정정 commit 이 *commit message 만* 이 아닌 *코드 (주석/문자열)
도 정정* — tree hash 모두 다름.

## 4. 매핑 시도 2 — timestamp (성공)

### 4.1 가설

`git filter-branch` 의 default 동작이 author/committer date 보존.
commit message + tree 변경되어도 *timestamp 동일*.

`git log -1 --format='%ad' --date=iso-strict <sha>` 로 옛/새 commit 의
timestamp 비교.

### 4.2 구현

```bash
> /tmp/tag_ts_map.txt
while IFS='|' read -r tag old_sha old_tree; do
  ts=$(git log -1 --format='%ad' --date=iso-strict "$old_sha")
  echo "$tag|$old_sha|$ts" >> /tmp/tag_ts_map.txt
done < /tmp/tag_unmatched.txt

git log main --format='%H %ad' --date=iso-strict > /tmp/main_ts_idx.txt

while IFS='|' read -r tag old_sha old_ts; do
  new_sha=$(grep " $old_ts$" /tmp/main_ts_idx.txt | head -1 | awk '{print $1}')
  ...
done
```

### 4.3 결과

```
matched: 34
unmatched: 0
```

**매핑 100%** ✓. 첫 5 매칭 검증:
```
0.0.1 → 79abd54  🚀 ci(release): GH Actions tag 빌드 + ADR-0025 + BRAT RE
0.1.0 → 1a1381e  🔖 release(v0.1.0): MVP feature set 완성 + ADR-0026/0027
0.1.1 → aaa9f6b  🐛 fix(plugin): localhost:4321 PreviewServer + 빈 repo 42
0.1.3 → dd86faf  ✨ feat(preview): SSE 라이브 리로드 (저장 시 즉�
0.1.4 → 238b71d  ✨ feat(settings): Preview server 시작/중지 버튼 추�
```

## 5. 회복 작업 — 단계별

### 5.1 단계 1: local tag 삭제

```bash
TAGS_TO_DELETE=$(cut -d'|' -f1 /tmp/tag_new_map.txt | tr '\n' ' ')
git tag -d $TAGS_TO_DELETE
```

### 5.2 단계 2: origin tag 삭제

```bash
DELETE_REFS=$(cut -d'|' -f1 /tmp/tag_new_map.txt | sed 's|^|:refs/tags/|' | tr '\n' ' ')
git push origin $DELETE_REFS
```

### 5.3 단계 3: annotated tag 작성

```bash
while IFS='|' read -r tag new_sha; do
  git tag -a "$tag" "$new_sha" -m "release v$tag"
done < /tmp/tag_new_map.txt
```

lightweight 가 아닌 *annotated* 사용 — 미래의 push.followTags 동작
가능성 + tagger 정보 (사용자 git config) 포함.

### 5.4 단계 4: origin push

```bash
PUSH_TAGS=$(cut -d'|' -f1 /tmp/tag_new_map.txt | tr '\n' ' ')
git push origin $PUSH_TAGS
```

### 5.5 잔여 8 tag 후속 처리

처음 매핑 단계에서 9 tag (0.1.40~0.1.49) 별도 진행 + 34 tag batch 진행
후, 검증에서 8 tag 잔존 발견 (0.1.2, 0.1.9, 0.1.18, 0.1.21, 0.1.24,
0.1.28, 0.1.31, 0.1.38). 이는 *처음 OUT 분류 시* 누락 — 동일 timestamp
매핑으로 8 tag 추가 회복.

## 6. release.yml 의 무반응 검증

새 release.yml workflow ([git-desktop-workflow postmortem 참조](2026-04-27-option-b-and-viewer-sync.md#release.yml-새-trigger-첫-작동-검증))
의 trigger:
```yaml
on:
  push:
    branches: [main]
    paths: [manifest.json]
  workflow_dispatch:
```

tag push 가 trigger 0 (옛 trigger `tags: ['*']` 폐기). 따라서 51 tag
재작성 + push 가 release.yml 을 trigger 하지 않음 → release 중복 작성
0 ✓.

검증:
```bash
$ gh run list --workflow='release.yml' --limit 1
completed  success  v0.1.49 release  9s  2026-04-27T02:53:41Z
```

마지막 run 은 v0.1.49 의 manifest paths trigger — tag 재작성 무관.

## 7. 최종 검증

```bash
# 모든 tag IN_MAIN 검증
ALL_OUT=0
for tag in $(git tag -l); do
  TAG_SHA=$(git rev-list -n 1 "$tag")
  if ! git merge-base --is-ancestor "$TAG_SHA" HEAD; then
    echo "OUT: $tag"
    ALL_OUT=$((ALL_OUT+1))
  fi
done
echo "OUT_OF_MAIN: $ALL_OUT"
```

결과: `OUT_OF_MAIN: 0` ✓

local + origin tag 수: 51 (sync). GitHub release 수: 48 (0.1.46 skip +
m1-domain-complete + 0.0.1 의 release asset 미작성 = release 차이).
release 객체 + asset 모두 보존 — tag 재작성은 *tag ref 만* 변경.

## 8. Lessons Learned

### 8.1 git history rewrite 의 영향 범위

`git filter-branch` 또는 `git rebase --root` 가 *root 부터* 모든 commit
재작성 시:
- 모든 commit SHA 변경
- tree hash 도 *content 변경 시* 변경
- author/committer date 는 default 동작으로 보존

따라서 *timestamp* 가 *유일한 stable identifier* — 정정 후에도 매핑
가능.

### 8.2 lightweight vs annotated tag

본 repo 의 모든 tag 가 lightweight 였던 점이 본 사고의 *증폭 요인*:
- `push.followTags=true` 옵션이 annotated 만 자동 push → lightweight 는
  manual push 의무
- annotated tag 의 *tagger metadata* 는 lightweight 에는 부재

회복 작업에서 *모두 annotated 로 전환*. 미래의 release 도 annotated 의무.

### 8.3 release.yml trigger 의 *workflow 분리* 가치

이전 workflow (tag push trigger):
- tag 재작성 → trigger → release 중복 작성 위험
- tag delete + recreate 마다 release 객체 정합성 문제 가능

새 workflow (manifest paths trigger):
- tag push 무반응 → 회복 작업 안전
- *tag 와 release asset 의 분리* 가 운영 사고 회복성 확보

[git-desktop workflow 변경](../README.md#release) 의 *부수 가치* — release
trigger 가 *별 차원* 으로 분리됨.

### 8.4 timestamp 매핑의 일반화

본 사고 회복 패턴은 *재사용 가능*:
1. 옛 tag → 옛 SHA → 옛 timestamp
2. main 의 모든 commit timestamp 인덱스
3. 1:1 매핑 + annotated tag 전환

향후 다른 repo 의 history rewrite 사고에 동일 패턴 적용 가능. timestamp
보존이 default 동작이라는 가정에 의존.

### 8.5 *처음 분류 검증* 의 의무

본 작업에서 처음 *9 IN + 42 OUT 분류* 검증 시 8 tag 누락 발견. *모든
tag iterate + ancestry 검증* 이 마지막 단계 의무 — 처음 분류만 신뢰
하지 않을 것.

## 9. 미해결 영역

### 9.1 commit-edit branch 정리

본 작업 중 `commit-edit/20260427-104535-bakeum-purge` branch 잔존.
사용자 정정 작업의 *backup branch* — 옛 SHA 보존. 후속 정리 의무
(사용자 결정).

### 9.2 m1-domain-complete-en-backup 의 역할

영문 commit 의 *역사 보존 backup* 의도 — 정정 후 *영문 commit 모두
한국어로* → backup 의 의미가 *그 시점의 영문 backup* 보존이 아니게 됨.
새 매핑이 *한국어 commit* 을 가리킴 — backup 의미 약화. 사용자 결정
의무.

### 9.3 GitHub release 의 commit reference

GitHub release 객체는 *tag name* 으로 link → tag SHA 변경 시 release
의 "View commit" link 는 새 commit 을 가리킴. 단 release asset (main.js
등) 은 *그대로* — 빌드 시점의 binary 보존.

기능적 영향 0 — 사용자가 release asset 다운로드 시 정상.

## 10. Reference

- 정정 commit: `dd63193 📝 docs(lang): 비표준 한국어 어휘 일괄 정정`
- 매핑 file: `/tmp/tag_new_map.txt`, `/tmp/tag_remaining_map.txt`
- 처리 tag 수: 51 (9 + 34 + 8 단계별)
- backup branch: `commit-edit/20260427-104535-bakeum-purge`
- release.yml workflow change commit: `666f744 🚀 ci(release): manifest
  paths trigger + 자동 tag — GitHub Desktop 워크플로`
- 관련 postmortem:
  - [option B and viewer sync](2026-04-27-option-b-and-viewer-sync.md)
  - [cross-platform zip determinism](2026-04-27-cross-platform-zip-determinism.md)
