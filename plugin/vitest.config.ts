import { defineConfig } from 'vitest/config'
import fs from 'node:fs'

/**
 * src/embedded/* 의 .b64 / .txt / .html / .css 파일을 default text export 로
 * 처리. esbuild 빌드는 별도 loader 옵션 (esbuild.config.mjs) 으로 처리하나,
 * vitest 환경의 vite 는 default 가 asset URL 처리라 string 으로 import 안 됨.
 * v0.1.45 의 PlanFactory.test.ts 가 PlanFactory 를 import 하면서 필요해짐.
 */
const embeddedTextLoader = {
  name: 'notedrop-embedded-text',
  load(id: string) {
    if (/[/\\]embedded[/\\][^/\\]+\.(b64|txt|html|css)$/.test(id)) {
      let content = ''
      try {
        content = fs.readFileSync(id, 'utf-8')
      } catch {
        // 파일 없으면 빈 문자열 — fresh checkout (빌드 안 한 상태) 에도 OK
      }
      return `export default ${JSON.stringify(content)}`
    }
    return null
  }
}

export default defineConfig({
  plugins: [embeddedTextLoader],
  test: {
    globals: true,
    passWithNoTests: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/domain/**/*.ts', 'src/ports/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/types.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90
      }
    }
  }
})
