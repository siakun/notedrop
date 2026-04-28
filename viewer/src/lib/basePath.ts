/**
 * 사용자 hardcoded 자산 path 가 publish 시 share repo prefix 로 자동 변환되도록
 * placeholder 생성 helper.
 *
 * Plugin 의 PlanFactory.collectViewerFiles 가 publish 시 viewer.zip 의 모든
 * text 자산 (HTML/JS/CSS/SVG/JSON) 안의 `/__NOTEDROP_BASE__` 를 사용자 share
 * repo segment (예: `/notedrop-share`) 로 string replace. PreviewServer 의
 * stripBasePath 도 같은 placeholder 처리.
 *
 * Next.js 의 자동 basePath prefix 는 *Next.js 컴포넌트* (Image 등) 만 적용.
 * 사용자 hardcoded URL 은 이 helper 의무.
 *
 * Production build (NODE_ENV='production') 에서만 placeholder 를 prefix.
 * `next.config.mjs` 의 `basePath: isProd ? PLACEHOLDER : ''` 와 동일 정책 —
 * dev / test 에서는 root path 그대로 (Next dev 가 public/ 직접 서빙).
 *
 * @example
 *   // ❌ host root 기준 → GH Pages 호스팅 prefix mismatch
 *   const iconUrl = '/icons/view-settings/layout-default.svg'
 *
 *   // ✓ prod 빌드 시 placeholder, dev/test 에서는 그대로
 *   const iconUrl = withBase('/icons/view-settings/layout-default.svg')
 */
const PLACEHOLDER = '/__NOTEDROP_BASE__'

export function withBase(path: string): string {
  if (!path.startsWith('/')) {
    // 이미 상대 path 또는 외부 URL — 그대로
    return path
  }
  if (path.startsWith(PLACEHOLDER)) {
    // 이미 placeholder 적용 — 중복 방지
    return path
  }
  if (process.env.NODE_ENV !== 'production') {
    // dev / test: Next dev 가 root 에서 public 자산 서빙. placeholder 불필요.
    return path
  }
  return `${PLACEHOLDER}${path}`
}

/** 본 helper 가 등록한 placeholder 를 외부 (테스트 등) 가 검증 가능하게 노출. */
export const NOTEDROP_BASE_PLACEHOLDER = PLACEHOLDER
