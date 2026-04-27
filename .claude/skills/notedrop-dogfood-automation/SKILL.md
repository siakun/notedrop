---
name: notedrop-dogfood-automation
description: Use when developing notedrop plugin/viewer and need to verify behavior in a live Obsidian vault — read plugin log, inspect/edit data.json, trigger publish commands, reload plugin, install fresh release, compare share repo tree against baseline, probe GH Pages, or reproduce cache hit/miss/fingerprint-mismatch scenarios without manual user steps
---

# Notedrop Dogfood Automation

vault 안 plugin 의 모든 read/write/명령/검증 step 을 obsidian-cli + gh + curl 로 자동화. 사용자 수동 첨부·수동 publish·수동 BRAT 재설치 없음 으로 dogfood 사이클 닫음.

## 전제

- `obsidian` CLI 가 PATH 등록 + Obsidian 1.4+ 가 실행 중
- 활성 vault = notedrop plugin 설치된 vault (없으면 `obsidian vault="<name>"` prefix)
- `gh` CLI 인증 완료 (`gh auth status` 로 `repo` scope 확인)
- 본 skill 의 모든 명령은 *실행 중인 Obsidian 인스턴스* 에 attach — Obsidian 안 떠있으면 0 작동

## 검증된 능력 (실측 완료)

| § | 작업 | 결과 | 핵심 명령 |
|---|---|---|---|
| 3.1 | notedrop.log + events.jsonl read + stat | ✅ | `obsidian eval` + `app.vault.adapter.read/stat` |
| 3.2 | data.json read + edit + persist | ✅ | `plugin.saveData()` 또는 `adapter.write` |
| 3.3 | 명령어 trigger (sync return) | ✅ | `obsidian command id=notedrop:<cmd>` |
| 3.3 | wall clock 측정 | ✅ | log 자체에 `durationMs` 측정 가능 — parse 만 |
| 3.4 | Obsidian window screenshot | ⚠️ | path 처리 불안정 — 별도 디버깅 필요 |
| 3.4 | 브라우저 viewer screenshot | ❌ | obsidian-cli 범위 밖 — `playwright-skill` 또는 `browser-use` 대안 |
| 3.5 | GH Pages cache propagation | ✅ | `gh api commits/main` + `curl -I` Last-Modified diff |
| 4.1 | plugin manual install (큰 binary) | ✅ | `gh release download` + `adapter.write` (2.89MB 6ms) |
| 4.2 | plugin reload | ✅ | `obsidian plugin:reload id=notedrop` |
| 4.3 | onload 신호 capture | ✅ | `lifecycle_onload` event 기록, events.jsonl 에서 polling |
| 5.1 | share repo 전 tree | ✅ | `gh api git/trees/main?recursive=1` |
| 5.2 | stale 자산 cleanup | 🚧 | stub 작성, `dogfood:cleanup-stale-buildid` 명령 (미구현 후속) |
| 5.3 | chunk byte 비교 | ✅ | `gh api git/blobs/<sha>` + base64 decode |
| 6.1 | 시나리오 자동 재현 | ✅ | data.json 저장 → reload → command → log parse |
| 6.2 | wall clock 누적 | ✅ | log entry `durationMs` parse |
| 6.3 | mock vault 생성 | ❌ | obsidian-cli = 실행 중 vault 만 attach. 신규 vault 생성 API 0 |
| 7.1 | GH Pages 상태 read | ✅ | `gh api repos/X/pages` |
| 7.1 | GH Pages enable/disable | ❌ | `administration:write` PAT scope 의무. 기본 token (gist/repo/workflow) 부족 |
| 7.2 | release asset 검증 | ✅ | `gh release download` + size/version compare |
| 7.3 | GH Pages viewer HTTP 검증 | ✅ | `curl -sI` 200/404 + script src 추출 |

## 핵심 패턴

### 1. log 분석 (사용자 수동 첨부 없음)

```bash
obsidian eval code="(async()=>{const a=app.vault.adapter;const t=await a.read('.obsidian/plugins/notedrop/notedrop.log');const lines=t.trim().split('\n');return JSON.stringify({total:lines.length,tail:lines.slice(-30).join('\n')})})()"
```

publish 한 번 후 마지막 entry 의 `durationMs`, `viewerCacheHit`, `commitSha`, `changedFiles` parse → 시나리오 검증.

### 2. settings 시나리오 등록 (cache miss / fingerprint mismatch 재현)

```bash
# cache miss 강제: 뷰어 cache key null
obsidian eval code="(async()=>{const p=app.plugins.plugins.notedrop;p.settings.lastViewerCacheKey=null;await p.saveData(p.settings);return JSON.stringify({cleared:true})})()"

# fingerprint mismatch 강제: fake key 설정
obsidian eval code="(async()=>{const p=app.plugins.plugins.notedrop;p.settings.lastViewerCacheKey='fake-fingerprint-deadbeef';await p.saveData(p.settings);return 'set'})()"

# baseline reset
obsidian eval code="(async()=>{const p=app.plugins.plugins.notedrop;p.settings.lastPublishedFiles=null;p.settings.lastPublishedDigest=null;await p.saveData(p.settings);return 'reset'})()"
```

### 3. 명령 trigger + log polling (v0.1.46 이전)

```bash
# 1) log 현 size 기록 → 2) command → 3) bash 외부 sleep 폴링 → 4) log 새 entry parse
SIZE_BEFORE=$(obsidian eval code="(async()=>(await app.vault.adapter.stat('.obsidian/plugins/notedrop/notedrop.log')).size)()" 2>&1 | tail -1 | grep -oP '\d+')
obsidian command id=notedrop:publish-vault
for i in $(seq 1 60); do
  sleep 1
  SIZE=$(obsidian eval code="(async()=>(await app.vault.adapter.stat('.obsidian/plugins/notedrop/notedrop.log')).size)()" 2>&1 | tail -1 | grep -oP '\d+')
  [ "$SIZE" -gt "$SIZE_BEFORE" ] && break
done
# log tail parse
```

⚠️ eval 안에서 `setTimeout` 기반 await 는 작동 안 함 (CDP eval timeout). 폴링은 *외부 bash sleep* 의무.

### N. events.jsonl polling (v0.1.47+, debugMode 활성 시)

```bash
# 1) trace 발급 명령 trigger
obsidian command id=notedrop:dogfood:trigger-publish-smart

# 2) events.jsonl tail polling (외부 sleep)
EVENTS_PATH='.obsidian/plugins/notedrop/events.jsonl'
for i in $(seq 1 60); do
  sleep 1
  TAIL=$(obsidian eval code="(async()=>{const t=await app.vault.adapter.read('$EVENTS_PATH');return t.slice(-2000)})()" 2>&1 | tail -1)
  echo "$TAIL" | grep -q "dogfood_publish_completed" && break
  echo "$TAIL" | grep -q "dogfood_publish_skipped" && break
  echo "$TAIL" | grep -q "dogfood_publish_failed" && break
done

# 3) 마지막 entry parse
LAST=$(obsidian eval code="(async()=>{const t=await app.vault.adapter.read('$EVENTS_PATH');const lines=t.trim().split('\n');return lines[lines.length-1]})()" 2>&1 | tail -1)
# durationMs / mode / error 회수
```

### 4. BRAT 우회 — 새 release manual install

```bash
# 1) download
gh release download <ver> -R siakun/notedrop --dir /tmp/nd
# 2) adapter.write 3 file (Windows path 변환 의무)
obsidian eval code="(async()=>{const a=app.vault.adapter;const fs=require('fs');for(const f of ['main.js','manifest.json','styles.css']){const buf=fs.readFileSync('C:/Users/User/AppData/Local/Temp/nd/'+f,'utf8');await a.write('.obsidian/plugins/notedrop/'+f,buf)}return 'installed'})()"
# 3) reload
obsidian plugin:reload id=notedrop
# 4) version 확인
obsidian eval code="JSON.stringify({v:app.plugins.plugins.notedrop.manifest.version})"
```

### 5. share repo stale buildId 검출 (자동 cleanup 후보 결정)

```bash
gh api repos/siakun/notedrop-share/git/trees/main?recursive=1 \
  --jq '.tree | map(select(.path | startswith("_next/static/"))) | group_by(.path | split("/")[2]) | map({buildId:.[0].path | split("/")[2], files:length})'
```

현재 살아있는 buildId 만 manifest 에서 보존, 나머지는 Tree API 로 sha=null 등록한 새 tree commit.

### 6. GH Pages cache propagation 측정

```bash
COMMIT_TIME=$(gh api repos/siakun/notedrop-share/commits/main --jq '.commit.committer.date')
LAST_MOD=$(curl -sI "https://siakun.github.io/notedrop-share/manifest.json" | grep -i last-modified | cut -d: -f2-)
# 둘 diff = CDN propagation latency. Cache-Control max-age=600 이라 이후 10분간 stale 가능
```

### 7. viewer UI 작동 (브라우저)

obsidian-cli 범위 밖. 의무 의무:
- HTML/JSON status: `WebFetch` 또는 `curl -sI`
- 시각 검증·console error: `playwright-skill` 또는 `browser-use` skill 호출
- 예: `curl -sI <viewer>/_next/static/<expectedBuildId>/_buildManifest.js` 가 404 → buildId mismatch 검출

## 우선순위 (작업 자주 빈도순)

1. log read + parse (§3.1) — 매 publish 후
2. 명령 trigger + 폴링 (§3.3) — 매 시나리오
3. plugin reload (§4.2) — 매 release 후
4. settings 변경 (§3.2) — 시나리오 재현
5. share repo tree compare (§5.1) — baseline 검증
6. GH Pages HTTP (§7.3) — viewer 작동
7. release manual install (§4.1) — BRAT cache 우회
8. stale cleanup 결정 (§5.2)
9. chunk byte compare (§5.3) — deterministic fix 검증

## debugMode 활성 시 추가 명령 (v0.1.47+)

| 명령 | 동작 | events.jsonl event |
|---|---|---|
| `notedrop:dogfood:dump-state` | devSnapshot 등록 | `dogfood_dump_state_{started,completed}` |
| `notedrop:dogfood:reset-cache` | lastViewerCacheKey null | `dogfood_reset_cache_completed` |
| `notedrop:dogfood:fake-fingerprint` | 잘못된 key 설정 | `dogfood_fake_fingerprint_completed` |
| `notedrop:dogfood:reset-baseline` | 모든 baseline 필드 null | `dogfood_reset_baseline_completed` |
| `notedrop:dogfood:export-baseline` | baseline file mapping | `dogfood_export_baseline_completed` |
| `notedrop:dogfood:dump-log-tail` | notedrop.log tail (100줄) | `dogfood_dump_log_tail_{completed,failed}` |
| `notedrop:dogfood:trigger-publish-smart` | smart publish + trace | `dogfood_publish_{started,completed,skipped,failed}` |
| `notedrop:dogfood:trigger-publish-force` | force publish + trace | `dogfood_publish_{started,completed,skipped,failed}` |
| `notedrop:dogfood:cleanup-stale-buildid` | (stub) | `dogfood_cleanup_skipped` |

## 한계 (해결 0, 우회책 등록)

| 한계 | 우회책 |
|---|---|
| 브라우저 viewer 시각 검증 | `playwright-skill` 또는 `browser-use` 호출 |
| Obsidian window screenshot path | obsidian-cli 의 path 처리 quirk — `dev:cdp method=Page.captureScreenshot` 으로 base64 받기 시도 가능 (미완 검증) |
| mock vault 생성 (§6.3) | 사용자 수동 vault 생성 + Obsidian 으로 1회 open. 이후 자동 |
| GH Pages enable (§7.1) | PAT 에 `administration:write` scope 스코프 부여 token 환경변수로 받음 |
| eval 안 setTimeout-async | 외부 bash sleep 폴링으로 분리 |

## ⚠️ 보안 의무

`app.plugins.plugins.notedrop.settings` 존재 = `githubPat` *평문 노출* (PAT). 다음 의무:

- log/console 출력에 `settings` 전체 dump 절대 금지
- settings 일부만 dump 시 `{...settings, githubPat:'***'}` 마스킹
- skill 사용자가 settings 검증 시 `delete s.githubPat` 후 stringify

```bash
# 안전 dump 예시
obsidian eval code="(()=>{const s={...app.plugins.plugins.notedrop.settings};delete s.githubPat;return JSON.stringify(s,null,2)})()"
```

## 일반 실수

- **vault 미타깃**: 활성 vault 가 다른 곳이면 `obsidian vault="obsidian-personal" eval ...` 의무
- **eval timeout**: 다단계 await 등록된 eval 은 첫 microtask 만 await. setTimeout 또는 long-running 은 외부 폴링으로 분리
- **exit code 신뢰 금지**: `obsidian dev:*` 명령은 stdout 정상이지만 exit 127/255 발생 (Windows quirk). 출력 자체로 검증
- **path 변환 누락**: bash `/tmp/x` ≠ Obsidian eval `C:\\Users\\...\\Temp\\x`. `cygpath -w` 또는 `C:/Users/...` 로 변환
- **명령 fires-and-forgets**: `executeCommandById` sync return = "트리거 받음" 만. 실 완료는 log 폴링 의무
