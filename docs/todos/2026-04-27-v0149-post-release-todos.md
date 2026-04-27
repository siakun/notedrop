# v0.1.49 이후 처리 대상 정리

작성일: 2026-04-27
상태: 임시 (작업 진행/완료 시 항목 삭제 또는 본 문서 폐기)
배경: v0.1.49 release 직후, 직전 세션에서 정리한 미해결 + 잠재 후보 모음.

---

## 1. 우리가 해야 할 일 정리

### 1.1 문서화된 미해결 (postmortem + handoff 참조)

| 항목 | 출처 | 우선순위 |
|---|---|---|
| 사용자 vault 의 `Notedrop: Sync viewer assets` 1회 실행 → 진짜 cache hit 측정 | `docs/postmortems/2026-04-27-option-b-and-viewer-sync.md` §7.2 | 높음 (cache 사이클 회복 검증) |
| `dogfood:cleanup-stale-buildid` 실 구현 — share repo 의 stale buildId (`FJemeaPN-...` 등) Tree API `sha=null` cleanup | option-b §7.3 + v0.1.47 stub | 중간 (UX 개선) |
| github-actions runner 의 v0.1.49 release fingerprint 가 로컬 빌드 (`2e131efd5de31508b58b1743d35dee638c34523811d1585a03a26bce4bae2217`) 와 일치하는지 검증 | `docs/postmortems/2026-04-27-cross-platform-zip-determinism.md` §11.1 | 높음 (fix 검증) |
| `commit-edit/20260427-...` backup branch 정리 (사용자 결정) | `docs/postmortems/2026-04-27-tag-history-recovery.md` §9.1 | 낮음 |
| `m1-domain-complete-en-backup` tag 의 역할 재정의 (영문 backup 이 한국어 commit 가리키는 모순) | tag-history §9.2 | 낮음 |
| viewer UI visual 검증 자동화 (playwright-skill 또는 browser-use 우회) | option-b §7.x + `notedrop-dogfood-automation` SKILL.md §7 | 중간 |
| spec §13.3.13 — onLayoutReady fingerprint mismatch Notice 명시 (v0.1.48 추가분, 미반영) | 본 세션 | 낮음 |

### 1.2 다음 세션 시작 시 의무

`docs/superpowers/handoffs/2026-04-27-v0148-viewer-sync-gap-fix.md` §8 의 5단계 — 사용자가 BRAT update + reload 후 검증 + sync 실행 → cache hit 측정.

---

## 2. v0.1.49 이후 잠재 버그/최적화 후보

코드 인스펙션 + dogfood 패턴 분석에 근거.

### 2.1 운영 안정성

| 후보 | 근거 | 영향 |
|---|---|---|
| `events.jsonl` 무한 누적 | EventLogger 가 rotation 미적용 (`notedrop.log` 만 10MB rotation) | debugMode 장기 활성 시 vault 디스크 누수 |
| logger.flush race | `onunload` 가 `flush()` await 하지만 Obsidian 의 plugin disable 시 onunload timeout 5초. flush 가 그 이상이면 entry 누락 | 진단 데이터 누락 |
| dogfood 명령어 노출 가드 | `debugMode=true` 시 등록. 사용자가 실수로 활성화하면 `dogfood:reset-baseline` 같은 위험 명령 노출 | 위험 (사용자 명시 confirm 0) |
| SeedPersistence race | vault 이벤트 + settings save 동시 호출 시 경쟁 가능성 | 드물지만 baseline 손상 잠재 |

### 2.2 성능 최적화

| 후보 | 근거 | 영향 |
|---|---|---|
| PreviewServer viewer.zip 매 시작 unpack | ~3MB unzip 매번. plugin onload 시 미리 unpack + 메모리 보존 가능 | preview server 시작 ~수백 ms 절감 |
| ContentTransformer 의 이미지 path 처리 | 매 publish 시 vault 의 image 이진 파일 read (~수MB). cache 미적용 | 노트 변경 0 + 이미지 변경 0 시 read 회피 가치 |
| GitHubPublisher blob 병렬화 | 현재 순차. 144 파일 등록한 force publish 의 ~68초 → 병렬 시 ~10초 추정 | sync 시간 7배 절감 (단 GitHub rate limit 의무) |
| DirtyTracker.computeDigest cache | Settings UI 진입 시 호출. 매번 sha256. 같은 plan 의 short-cache 가치 | UX 응답성 |

### 2.3 알려진 한계 (postmortem 의 미검증)

| 후보 | 근거 | 영향 |
|---|---|---|
| 5MB+ image publish 실패 가능성 | viewer-rewrite-completion 핸드오프 §7. GitHub Tree API blob 의 100MB 한계 + base64 인코딩 33% 증가 | 큰 이미지가 포함된 노트 publish 실패 |
| Mermaid SVG + paged.js race | viewer-rewrite-completion §3.2. 50ms timeout 어림 처리 | 큰 graph 의 페이지 분할 오류 |
| paged.js 페이지 분할 + customCss 격리 | spec §11.4 release gate 미검증 | dogfood 미발견 |
| manifest.json 5MB 한계 | publishedSeeds 가 ~수백 노트 시 manifest 비대화 | scale 한계 |

### 2.4 UX 개선

| 후보 | 근거 | 영향 |
|---|---|---|
| SettingsTab 의 fingerprint mismatch indicator | option-b postmortem §3.3.3. 시각 표시 (현재 Notice 만) | 사용자 인지 강화 |
| Notice 의 사용자 dismiss 옵션 | 현재 timeout 만 자동 close. 사용자 X 버튼 미제공 | 작은 UX |
| publish 진행 progress bar | 68초 force publish 시 사용자 진행 상황 모름 | 큰 UX (긴 작업 시) |
| share URL 자동 복사 toggle | publish 후 Notice 만. 자동 클립보드 복사 옵션 | 작은 UX |
| Settings UI 의 baseline 상태 표시 | "마지막 publish: 2시간 전, 144 file" 같은 정보 | 진단 도움 |

### 2.5 잠재 버그 (코드 인스펙션)

| 후보 | 근거 | 영향 |
|---|---|---|
| PluginSettings load 시 unknown field drop | `loadSettings` 의 `{ ...DEFAULT_SETTINGS, ...stored }` 가 stored 의 unknown field 보존 → 다음 saveData 시 누적 | 미세 누수 |
| `deriveRepoSegment` 의 user/org page 케이스 | `repo === <owner>.github.io` 시 빈 segment. 단 `<owner>` 대소문자 비교 미명확 | edge case |
| viewer 의 hash routing # 누락 시 fallback | manifest 의 hash 직접 입력 시 (`[hash]/page.tsx`) 의 dynamic route 동작 | 작은 버그 |

---

## 3. 권장 진행 우선순위

1. 사용자 vault 의 진짜 sync 1회 실행 (사용자 의무) — cache 사이클 회복 검증 + v0.1.49 fingerprint github-actions runner 일치 검증 동시 처리
2. `events.jsonl` rotation + dogfood 명령어 가드 — 운영 안정성 (다음 plugin patch v0.1.50 의무)
3. `cleanup-stale-buildid` 실 구현 — share repo 의 stale 자산 정리 (사용자 dogfood UX)

---

## 4. 메타

- 본 문서는 임시이며, 항목이 처리되면 해당 줄 또는 섹션을 삭제한다.
- 모든 항목 처리 완료 시 본 문서 자체를 폐기한다.
- 새 항목이 발견되면 출처 (postmortem/handoff/code 위치) 명시 후 추가한다.
