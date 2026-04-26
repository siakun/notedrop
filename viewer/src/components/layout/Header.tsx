'use client'

import ViewSettingsPanel from '@/components/panels/ViewSettingsPanel'

export default function Header({ crumbLabel }: { crumbLabel: string | null }) {
  return (
    <header className="site-header">
      <a href="#/" className="brand">
        notedrop
      </a>
      <div id="crumbs">
        {crumbLabel && <span>{crumbLabel}</span>}
      </div>
      <ViewSettingsPanel />
    </header>
  )
}
