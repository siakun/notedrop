import { Notice } from 'obsidian'
import type { PluginContext } from '../../services/PluginContext.js'
import type { CommandDef } from '../types.js'

const FAKE_KEY = 'dogfood-fake-fingerprint-' + 'deadbeef'.repeat(4)

export async function fakeFingerprint(ctx: PluginContext): Promise<void> {
  const traceId = ctx.eventLogger.newTraceId()
  ctx.settings.lastViewerCacheKey = FAKE_KEY
  await ctx.saveSettings()
  await ctx.eventLogger.emit('dogfood_fake_fingerprint_completed', {
    fakeKey: FAKE_KEY
  }, traceId)
  new Notice(`notedrop dogfood: fake fingerprint set — next publish 가 mismatch 검출 의무`, 6000)
}

export const fakeFingerprintCommand: CommandDef = {
  id: 'dogfood:fake-fingerprint',
  name: '[dogfood] Set fake viewer fingerprint (force mismatch)',
  callback: (ctx) => fakeFingerprint(ctx)
}
