---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
  - m2
summary: BRAT 호환을 위해 manifest.json/main.js/styles.css 를 repo root 에 배치. spec §5.4 의 plugin/manifest.json 위치를 변경하는 메타-결정
---
# ADR-0025: Plugin manifest.json 위치 = repo root

- **Status**: Accepted (2026-04-26)
- **Supersedes**: spec §5.4 building-blocks 의 `plugin/manifest.json` 위치 (부분 변경)
- **Superseded by**: -

## Context

M2 단계에서 BRAT (Beta Reviewers Auto-update Tester) 로 알파 배포 가능 상태가 목표.
BRAT 의 동작:

1. 사용자가 GitHub repo URL (`https://github.com/<owner>/<repo>`) 입력
2. BRAT 가 `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/manifest.json` 으로 plugin metadata 검증 — **레포 루트의 manifest.json 만 인식**
3. BRAT 가 GitHub Releases API 로 최신 release 의 `main.js`, `manifest.json`, `styles.css` 다운로드 — **release 의 root asset 으로만 attach**

spec §5.4 의 building-blocks 트리는 모든 plugin 파일이 `plugin/` 하위에 있다고 가정. 단일 plugin repo 라면 자연스럽지만 본 프로젝트는 `plugin/` (소스) + `viewer/` (Next.js) 모노레포 구조라 root 와 plugin/ subfolder 가 분리된다.

대안 비교:

| 옵션 | 장점 | 단점 |
|---|---|---|
| A. plugin/manifest.json 유지 + BRAT 분기 | spec 그대로 | BRAT 가 root 만 봐 작동 X. 공식 plugin store 도 root 요구 |
| B. manifest.json 을 root 로 이동 | BRAT/공식 store 모두 호환 | spec §5.4 트리 변경 필요 |
| C. root 에 symlink + plugin/manifest.json 원본 유지 | spec 유지 | git 의 symlink Windows 호환성 취약, GH 가 raw.githubusercontent 로 따라가지 않음 |
| D. 서브트리 별도 repo 분리 | 표준 layout | 모노레포 ADR-0013 위배, 통합 개발 흐름 손상 |

## Decision

**옵션 B 채택**. manifest.json + main.js + styles.css 를 repo root 에 배치.

### 새 파일 레이아웃

```
/manifest.json              ← Obsidian plugin metadata (BRAT root 검증용)
/styles.css                 ← optional plugin CSS (현재 빈 파일)
/main.js                    ← esbuild 산출물 (.gitignore, GH Actions release attach)
/plugin/
  ├── package.json          ← 빌드/테스트 스크립트
  ├── esbuild.config.mjs    ← outfile: '../main.js'
  └── src/                  ← TS 소스
/viewer/                    ← Next.js (M3+)
/.github/workflows/release.yml  ← tag push -> build + asset upload
```

esbuild outfile 을 `../main.js` 로 지정해 빌드 산출물이 자동으로 root 에 떨어진다.
`main.js` 는 .gitignore 에 추가 — 빌드 산출물은 GH Actions 가 release asset 으로만 게시.
`manifest.json`/`styles.css` 는 git 에 commit (BRAT 가 raw.githubusercontent 로 검증).

### spec §5.4 변경 범위

- `plugin/manifest.json` → `/manifest.json` 로 spec 트리 수정 필요
- `plugin/styles.css` → `/styles.css`
- 기타 (도메인·Adapter·뷰어 구조) 모두 그대로 유효

## Consequences

긍정:
- BRAT 알파 배포가 코드 변경 없이 동작 (manifest version 만 release tag 와 일치시키면 끝)
- 추후 공식 plugin store 등재 시에도 동일 layout 이라 추가 작업 0
- `/main.js` 가 .gitignore 라 vault 동기화 시 빌드 산출물이 따라가지 않음

부정:
- spec §5.4 와 실제 layout 불일치 (이 ADR 로 명문화하나 spec 본문 갱신 필요)
- 모노레포 root 가 plugin metadata 로 점유됨 (viewer/ 가 root metadata 처럼 보일 위험은 없으나 root 가 plugin 소속으로 인식될 수 있음)
- 빌드가 `../` 를 outfile 로 가져 cwd 의존이 plugin/ 디렉터리에 강하게 묶임

## Alternatives Considered

상세는 §Context 표 참조. 핵심 거부 사유:
- A: BRAT 호환 불가 → 목표 미달
- C: symlink 의 Windows·GitHub raw 호환성 모두 취약
- D: 모노레포 (ADR-0013) 와 충돌, 개발 흐름 분리 비용 큼

## Related

- ADR-0013: 뷰어 위치 = 플러그인 레포 (모노레포 결정)
- ADR-0022: 플러그인명 = notedrop
- spec §5.4 building-blocks (실제 트리는 본 ADR 우선)
- spec §11.5 M2 산출물
- 외부: [BRAT README](https://tfthacker.com/brat) · 매니페스트 검증 동작
