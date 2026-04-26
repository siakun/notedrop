/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

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

const config = {
  output: 'export',
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
  }
}

export default config
