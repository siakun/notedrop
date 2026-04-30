import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'))
const buildVersion = pkg.version

let buildSha = process.env.GITHUB_SHA || ''
if (!buildSha) {
  try {
    buildSha = execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim()
  } catch {
    buildSha = 'unknown'
  }
}
const buildShaShort = buildSha.slice(0, 7) || 'unknown'

// prod 빌드 시 basePath = placeholder. plugin 의 publishVault 가 publish
// 시점에 사용자 share repo 이름 (settings.targetRepo 의 두번째 부분) 으로
// string replace 한다. 이로써 viewer 빌드 1 회로 어느 share repo 든 작동.
//
// preview server (localhost:4321) 도 placeholder 적용된 자산 그대로 받지만
// PreviewServer.stripBasePath() 가 처리.
//
// __NOTEDROP_BASE__ 은 GitHub repo 이름에 쓰일 수 없는 문자 (__) 가 양 끝
// 이라 실수로 다른 path 와 충돌할 일 없음.
const PLACEHOLDER_BASE = '/__NOTEDROP_BASE__'

// Dev 한정 rewrites: viewer/samples/ 변경을 즉시 반영하기 위해 /manifest.json,
// /content/**, /events 를 사이드카 (port 4321 default) 로 proxy.
// 사이드카 = 플러그인의 PreviewServer 클래스를 그대로 재사용 — same SSE 흐름.
// prod build 에는 rewrites 함수 자체를 attach 하지 않아 'output: export' 와
// 공존 시 Next 14 warning 도 피함. NOTEDROP_SIDECAR_PORT 로 포트 override 가능.
const devRewrites = async () => {
  const sidecarPort = process.env.NOTEDROP_SIDECAR_PORT || '4321'
  const base = `http://127.0.0.1:${sidecarPort}`
  // beforeFiles: Next 가 public/manifest.json (예전 npm run gen:sample 산출
  // 정적 파일) 을 서빙하기 *전에* 사이드카로 보냄. afterFiles 로 두면
  // public/ 가 이김 → 사이드카 변경이 안 보이는 silent failure.
  return {
    beforeFiles: [
      { source: '/manifest.json', destination: `${base}/manifest.json` },
      { source: '/content/:hash/index.md', destination: `${base}/content/:hash/index.md` },
      { source: '/content/:hash/_assets/:asset*', destination: `${base}/content/:hash/_assets/:asset*` },
      // trailingSlash:true 가 /events → /events/ 308 redirect 시키므로
      // 양쪽 다 매칭. 사이드카 핸들러도 둘 다 받음.
      { source: '/events', destination: `${base}/events` },
      { source: '/events/', destination: `${base}/events` }
    ]
  }
}

const config = {
  // dev 에서는 export 모드 + rewrites 사용; prod 는 정적 export 만.
  ...(isProd ? { output: 'export' } : { rewrites: devRewrites }),
  basePath: isProd ? PLACEHOLDER_BASE : '',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // v0.1.46 fix — Next.js 가 매 빌드마다 random buildId 발급하는 default 동작이
  // viewer.zip 의 fingerprint 변동 원인 (postmortem
  // 2026-04-27-publish-efficiency-measurement.md §6.2). buildId 고정 →
  // 같은 viewer source 의 빌드 결과가 byte-deterministic → plugin 의
  // viewer.fingerprint.txt 도 deterministic → cache hit 정상 작동.
  //
  // viewer source 변경 시 chunk 이름 (content hash) 자동 변경 → buildManifest.js
  // content 변경 → fingerprint 다름. 즉 cache busting 정상.
  generateBuildId: async () => 'notedrop-viewer',
  experimental: {
    optimizePackageImports: ['katex', 'mermaid']
  },
  // Build-time identity — viewer 가 자기 자신의 version + git sha 를 알아야
  // local preview 에서 어떤 build 인지 확인 가능 (BuildInfoBadge 표시용).
  // SHA 는 commit 단위라 deterministic — same commit → same fingerprint.
  // 빌드 시점의 wall clock (Date.now 등) 은 절대 inject 금지 (v0.1.46 의
  // deterministic build 깨짐).
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
    NEXT_PUBLIC_BUILD_SHA: buildShaShort
  }
}

export default config
