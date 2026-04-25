# notedrop

Obsidian 플러그인 + 정적 뷰어. vault 의 일부 노트만 골라 GitHub Pages 로 발행한다.

- **현재 단계**: M2 — Obsidian plugin 코어 (도메인·Adapter·EventBridge·Settings·명령어) 완성, BRAT 알파 배포 가능 상태
- **저장소**: `siakun/notedrop` (public). vault 는 별도 private repo 에서 plugin 만 사용
- **라이선스**: TBD

## 구조

```
/manifest.json          Obsidian plugin metadata (BRAT 가 root 에서 검증)
/styles.css             plugin CSS (현재 빈 파일)
/main.js                esbuild 산출물 (release asset, .gitignore)
/plugin/                plugin TypeScript 소스 + 빌드
/viewer/                Next.js 정적 뷰어 (M3+)
/docs/                  arc42 13 섹션 + ADR 25 개
/.github/workflows/     release 자동화 (tag push -> build + upload)
```

자세한 설계는 [docs/](./docs/) 의 arc42 문서 + ADR 참고.

## BRAT 으로 설치 (알파)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tester) 을 사용해 정식 마켓플레이스 등재 전 알파 빌드를 설치할 수 있다.

1. Obsidian Community Plugins 에서 **BRAT** 설치 + 활성화
2. Command palette → `BRAT: Add a beta plugin for testing`
3. 입력: `https://github.com/siakun/notedrop`
4. **Add Plugin** 클릭 → BRAT 가 최신 release 의 `main.js`/`manifest.json`/`styles.css` 다운로드
5. Settings → Community Plugins → **Notedrop** 활성화
6. (선택) BRAT 설정에서 자동 업데이트 켜면 새 release 가 올라올 때마다 자동 갱신

설치 후 확인:
- DevTools 콘솔에 `notedrop loaded` 와 `notedrop: indexed N published note(s)` 출력
- Settings → Notedrop 탭에서 PAT/repo/URL 입력 가능
- Command palette 에 `Notedrop: Share this note` 등 4개 명령어 노출

## 개발

```bash
cd plugin
npm install
npm test            # vitest (도메인 + Bridge 단위 테스트)
npm run typecheck   # tsc --noEmit
npm run build       # esbuild -> ../main.js
npm run dev         # esbuild watch
```

빌드 산출물 (`/main.js`) 은 git 에 포함하지 않는다 — GH Actions 가 tag push 시 자동 빌드 후 release asset 으로 올린다.

### 새 release 만들기

```bash
# manifest.json version 과 일치하는 tag 사용 (BRAT 검증 요구)
git tag 0.0.1
git push origin main 0.0.1
```

GH Actions 가 자동으로:
1. `plugin/` 에서 `npm ci && npm run build`
2. `softprops/action-gh-release@v2` 로 release 생성
3. `main.js`, `manifest.json`, `styles.css` 를 asset 으로 attach

## 상태

- M1 (도메인 레이어): 완료. 179 테스트, 라인 커버리지 97.32%
- M2 (Adapter + 배포 인프라): 진행 중 (이 commit)
- M3+ (Git publisher, Next.js 뷰어, 실시간 프리뷰 SSE): 예정
