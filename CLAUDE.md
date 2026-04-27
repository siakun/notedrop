# notedrop CLAUDE.md

세션 / compact 후에도 절대 잊지 말 것.

## Release / tag 하네스 — 절대 규칙

**`.github/workflows/release.yml` 가 tag 와 GitHub Release 를 자체 생성한다.** 로컬에서 tag 를 만들거나 push 하지 말 것.

### 정상 흐름

1. 5 곳 version bump (한 commit 안에서):
   - `manifest.json`
   - `plugin/package.json`
   - `plugin/package-lock.json` (top-level `"version"` + `packages.""."version"` 모두)
   - `viewer/package.json`
   - `viewer/package-lock.json` (동일하게 두 곳)
2. `🔖 release(vX.Y.Z): ...` 커밋
3. **`git push origin main` 만**. 다른 인자 추가 금지.
4. release.yml 가 manifest.json paths trigger 로 자동 실행 → annotated tag `X.Y.Z` 작성 + push + asset 첨부.
5. `gh run watch <id>` 로 결과 monitor (별도 의무).

### 금지 행위

- `git tag X.Y.Z` 로컬 작성 후 push — release.yml 이 "Tag already exists — skip release" 로 스킵하고 release 가 안 만들어짐. v0.1.63 에서 한 번 실수 (postmortem `2026-04-28-viewer-pagination-review-fix.md` 직후 release 작업).
- `git push origin main X.Y.Z` 같이 tag 동봉 push — 위와 동일 결과.
- workflow re-run 없이 push 만 다시 시도 — main 이 이미 up-to-date 라 trigger 가 안 옴. 이 경우 `gh run rerun <id>` 가 복구 수단 (단 직전 run 이 fail 인 경우만 의미 있음, success 면 tag 가 이미 있어 그래도 skip).

### 복구 (실수로 tag 를 미리 push 했을 때)

```bash
git push --delete origin X.Y.Z   # 원격 tag 삭제
git tag -d X.Y.Z                 # 로컬 tag 삭제
gh run rerun <last-run-id>       # release.yml 재실행 → tag 새로 생성됨
```

⚠️ **실제 부수 피해 사례 (v0.1.63, 2026-04-28)**: 위 복구 절차가 GitHub REST `releases` listing index 를 corrupted state 로 빠뜨림. 같은 tag 가 짧은 시간에 push → delete → recreate 된 게 trigger. 증상:
- `releases/latest` REST: 정상 (최신 release 반환)
- `releases/tags/<v>` REST: 정상
- GraphQL `repository.releases`: 정상
- **`releases` listing REST: `[]` empty** — BRAT 의 "Change plugin version" dropdown 이 이 endpoint 를 쓰니까 dropdown 이 옛 버전만 노출.
- 우회: BRAT 에서 "Latest version" 옵션 (별도 endpoint) 사용 가능.
- 자연 회복 시간 미상. 추가 release 누적이 index 재구축을 유도할 가능성.

**그러므로**: 위 복구 절차는 **마지막 수단**. tag 동봉 push 자체를 안 하는 게 최선. 복구 후엔 BRAT 등 외부 도구의 listing endpoint 의존 결과를 확인해야 함.

### 참고

- README.md `### Release` 섹션 — manual tag 폐기 명시 (line 171).
- 메모리 `feedback_release_자율진행.md` — 자율 release 의무.
- 워크플로 정의: `.github/workflows/release.yml` (job `release` 의 `Create + push tag` step).

### 알려진 미해결 모순 (2026-04-28 기준)

- `plugin/src/main.ts:31` 의 `const PLUGIN_VERSION = '0.1.49'` 는 현재 manifest 와 분리되어 stale.
- README 는 4 곳 sync (PLUGIN_VERSION 포함, lock 제외), 메모리 + 실제 practice 는 5 곳 sync (lock 포함, PLUGIN_VERSION 제외) 로 갈라짐.
- 사용자 결정 후 (A) memory + practice 갱신 / (B) esbuild define 으로 build-time 주입해 source 상수 제거 / (C) 6 곳 sync 명시 중 하나로 통일 필요.
