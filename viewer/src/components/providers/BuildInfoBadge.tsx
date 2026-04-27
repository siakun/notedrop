'use client'

import { useEffect, useState } from 'react'

/**
 * 좌하단 build identity overlay. local preview (127.0.0.1 / localhost / 0.0.0.0)
 * 에서만 표시. dogfood 시 "어떤 viewer build 가 serve 되는지" 즉시 확인 인프라.
 *
 * 표시: `v{version} {gitSha7}` — package.json.version + git short SHA.
 * 빌드 시점에 next.config.mjs 가 inject (NEXT_PUBLIC_BUILD_*).
 *
 * production GH Pages 에서는 hostname check 로 비활성 — 사용자에게 노출 X.
 */
function isPreviewHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0'
}

export default function BuildInfoBadge() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(isPreviewHost())
  }, [])

  if (!visible) return null

  const version = process.env.NEXT_PUBLIC_BUILD_VERSION
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA
  if (!version) return null

  return (
    <div className="build-info-badge" role="status" aria-label="build identity">
      v{version}
      {sha ? <span className="build-info-sha"> · {sha}</span> : null}
    </div>
  )
}
