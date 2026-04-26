import fs from 'node:fs/promises'
import path from 'node:path'
import EntryClient from '@/components/viewer/EntryClient'
import type { Manifest } from '@/types/manifest'

export async function generateStaticParams(): Promise<{ hash: string }[]> {
  try {
    const manifestPath = path.join(process.cwd(), 'public', 'manifest.json')
    const raw = await fs.readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw) as Manifest
    return manifest.items.map((item) => ({ hash: item.hash }))
  } catch {
    return []
  }
}

export const dynamicParams = false

export default function Page({ params }: { params: { hash: string } }) {
  return <EntryClient hash={params.hash} />
}
