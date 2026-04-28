# notedrop CLAUDE.md

세션 / compact 후에도 절대 잊지 말 것.

## Viewer local browser 검증

notedrop viewer UI 를 Obsidian publish / release / BRAT / GH Pages 없이 바로 확인해야 하면 `.agents/skills` 의 standalone skill 을 사용한다.

- `notedrop-viewer-dev-preview`: 통합 흐름. `viewer/` 를 Next dev server 로 띄우고 현재 workspace source 를 localhost 에서 확인.
- `notedrop-viewer-dev-server`: dev server 만 준비하거나 수동 브라우저 확인이 필요할 때.
- `notedrop-viewer-playwright-check`: Playwright 로 DOM, hover, computed style, console error, 접근성 이름을 검증할 때.
- `notedrop-viewer-screenshot-check`: screenshot 기반으로 spacing, clipping, overlap, responsive, dark theme 을 확인할 때.

이 흐름은 local source 검증만 의미한다. Obsidian vault state, plugin command, publish output, cache key, release asset, GH Pages, BRAT 검증은 `notedrop-dogfood-automation` 을 사용한다.

## 테스트 = 로컬 dev server. 버전 bump 는 fix 확정 시에만

viewer UI · pagination · margin · layout · 스타일 · DOM · hover 등 동작을 *확인* 하기 위한 목적으로는 절대 version bump + release 하지 말 것. iteration 흐름:

1. `notedrop-viewer-dev-preview` (또는 `notedrop-viewer-dev-server`) 로 localhost dev server 띄움
2. 코드 수정 → HMR 자동 반영 → 브라우저에서 확인
3. 문제 발견 시 dev server 살아있는 상태로 다시 수정 → 즉시 재확인
4. 만족할 때까지 반복

5 곳 version bump + `🔖 release(vX.Y.Z): ...` commit + `git push origin main` 은 *fix 가 확정되어 사용자에게 배포 준비가 됐을 때만*. release 를 "동작 확인용 build artifact 생성기" 로 쓰지 말 것.

production (BRAT 설치 / GH Pages 배포) 동작 자체를 검증해야 하면 그건 `notedrop-dogfood-automation` 영역 — 그것도 5 곳 bump 와 별개 (실재 release asset 을 manual install 해서 확인하는 흐름).

배경: 한 fix 를 위해 0.x.N → 0.x.N+1 → 0.x.N+2 처럼 release 가 빠르게 누적되면 BRAT dropdown 갱신 부담 + v0.1.63 listing index 사고 같은 회귀 위험이 누적된다. 검증은 로컬에서, release 는 한 번에.

이 규칙은 메모리 `feedback_release_자율진행.md` 의 "자율 release 진행" 보다 우선한다 — 자율 release 는 fix 가 *이미 확정* 된 경우에만 적용.

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
- **`releases` listing REST: `[]` empty** — BRAT 의 "Change plugin version" dropdown 이 이 endpoint 를 쓰니까 dropdown 이 옛 버전만 노출. PAT 등록해서 cache 우회해도 빈 응답.
- 우회: BRAT 에서 "Latest version" 옵션 (별도 endpoint) 사용. 또는 `releases/latest/download/<asset>` 직접 다운로드.

**시도된 회복 절차 (모두 GitHub 측 listing index 는 못 살림, ETag stuck `078404...`)**:
1. `gh release edit --notes` 로 metadata 변경 → 효과 없음
2. `gh release edit --draft` 후 undraft toggle → 효과 없음
3. **clean slate**: 0.1.x release/tag 전부 삭제 (0.0.X + 0.1.X 67 tags + 5 releases) + `0.2.0` minor bump 재시작 → 새 release 정상 publish, `releases/latest` 도 0.2.0 반환, 그러나 listing endpoint 는 **여전히 `[]`**
4. user 는 BRAT 의 "Latest version" 옵션으로 0.2.0 설치 성공 — listing endpoint 는 GitHub Support 티켓 외에는 자력 복구 불가로 보임

**그러므로**: 위 "tag delete + rerun" 복구 절차는 **절대 피할 것**. tag 동봉 push 자체를 안 하는 게 최선. 일단 listing index 가 망가지면 재생성·minor bump 로도 안 살아남.

### 참고

- README.md `### Release` 섹션 — manual tag 폐기 명시 (line 171).
- 메모리 `feedback_release_자율진행.md` — 자율 release 의무.
- 워크플로 정의: `.github/workflows/release.yml` (job `release` 의 `Create + push tag` step).

### 알려진 미해결 모순 (2026-04-28 기준)

- `plugin/src/main.ts:31` 의 `const PLUGIN_VERSION = '0.1.49'` 는 현재 manifest (`0.2.0`) 와 분리돼 더 stale 해짐.
- README 는 4 곳 sync (PLUGIN_VERSION 포함, lock 제외), 메모리 + 실제 practice 는 5 곳 sync (lock 포함, PLUGIN_VERSION 제외) 로 갈라짐.
- 사용자 결정 후 (A) memory + practice 갱신 / (B) esbuild define 으로 build-time 주입해 source 상수 제거 / (C) 6 곳 sync 명시 중 하나로 통일 필요.

### v0.1.x → v0.2.0 reset (2026-04-28)

- 위 listing index 사고로 **v0.1.x 의 모든 release/tag 삭제 + v0.2.0 으로 minor bump 재시작**.
- 백업 tag (`m1-domain-complete{,-en-backup}`) 만 유지.
- 이전 v0.1.x history 는 main branch 의 commit 으로는 그대로 남음 (tag 만 사라짐).
- 마일스톤 정의 (M1~M5) 자체는 유효, README 의 "v0.1.x 시점" 문구만 의미상 v0.2.x 로 이동.
