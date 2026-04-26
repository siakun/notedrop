'use client'

import { usePageSize } from '@/hooks/usePageSize'
import { PAGE_SIZES, type PageSizeKey } from '@/lib/paginationConfig'

export default function PageSizeSelector() {
  const { size, setSize } = usePageSize()

  return (
    <label className="notedrop-page-size-selector">
      <span className="notedrop-control-label">사이즈</span>
      <select
        value={size}
        onChange={(e) => setSize(e.target.value as PageSizeKey)}
        aria-label="페이지 사이즈 선택"
      >
        {Object.values(PAGE_SIZES).map((preset) => (
          <option key={preset.key} value={preset.key}>
            {preset.label}
          </option>
        ))}
      </select>
    </label>
  )
}
