import type { PublishIndex } from './PublishIndex.js'
import type { Manifest, ManifestItem } from '../types.js'
import type { PublishedItem } from './types.js'

export type ManifestOptions = { generatedBy: string }

export class ManifestBuilder {
  constructor(private index: PublishIndex) {}

  build(opts: ManifestOptions): Manifest {
    const items = this.index.list()
      .map(serialize)
      .sort(orderItems)
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      items
    }
  }
}

function serialize(item: PublishedItem): ManifestItem {
  return {
    hash: item.hash,
    slug: item.slug,
    title: item.title,
    cover: item.cover,
    render: item.render,
    type: item.type,
    parent: item.parent,
    order: item.order,
    chapters: item.chapters,
    updatedAt: item.updatedAt
  }
}

function orderItems(a: ManifestItem, b: ManifestItem): number {
  if (a.type === 'entry' && b.type !== 'entry') return -1
  if (a.type !== 'entry' && b.type === 'entry') return 1
  if (a.parent && b.parent && a.parent === b.parent) {
    return (a.order ?? 0) - (b.order ?? 0)
  }
  return a.title.localeCompare(b.title)
}
