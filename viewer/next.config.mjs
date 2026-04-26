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
  experimental: {
    optimizePackageImports: ['katex', 'mermaid']
  }
}

export default config
