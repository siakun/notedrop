import type { PluginSettings } from './PluginSettings.js'

export function deriveShareUrlBase(targetRepo: string): string {
  const trimmed = targetRepo.trim()
  if (!trimmed) return ''
  const parts = trimmed.split('/')
  if (parts.length !== 2) return ''
  const owner = parts[0]?.trim()
  const repo = parts[1]?.trim()
  if (!owner || !repo) return ''
  if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return `https://${owner}.github.io`
  }
  return `https://${owner}.github.io/${repo}`
}

export function resolveShareUrlBase(settings: PluginSettings): string {
  const explicit = settings.shareUrlBase.trim().replace(/\/$/, '')
  if (explicit) return explicit
  return deriveShareUrlBase(settings.targetRepo)
}
