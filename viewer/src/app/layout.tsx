import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import 'katex/dist/katex.min.css'
import './globals.css'
import ViewSettingsProvider from '@/components/providers/ViewSettingsProvider'

export const metadata: Metadata = {
  title: 'notedrop',
  description: '옵시디언 vault 의 일부 노트를 정적 뷰어로 발행',
  icons: { icon: '/favicon.ico' }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body data-layout="default">
        <ViewSettingsProvider>{children}</ViewSettingsProvider>
      </body>
    </html>
  )
}
