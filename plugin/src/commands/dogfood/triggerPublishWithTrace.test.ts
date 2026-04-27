import { describe, expect, it } from 'vitest'
import type { PluginContext } from '../../services/PluginContext.js'
import { triggerPublishWithTrace } from './triggerPublishWithTrace.js'

describe('triggerPublishWithTrace', () => {
  it('emits skipped instead of completed when publish does not run', async () => {
    const events: Array<{
      type: string
      data?: Record<string, unknown>
      traceId?: string
    }> = []
    const ctx = {
      eventLogger: {
        newTraceId: () => 'trace-1234',
        emit: async (type: string, data?: Record<string, unknown>, traceId?: string) => {
          events.push({ type, data, traceId })
        }
      }
    } as unknown as PluginContext

    await triggerPublishWithTrace(ctx, 'smart', {
      smart: async () => ({ status: 'skipped', reason: 'not_dirty' }),
      force: async () => ({ status: 'skipped', reason: 'not_dirty' })
    })

    expect(events.map((event) => event.type)).toEqual([
      'dogfood_publish_started',
      'dogfood_publish_skipped'
    ])
    expect(events[1]!.data).toMatchObject({
      mode: 'smart',
      reason: 'not_dirty'
    })
    expect(events[1]!.traceId).toBe('trace-1234')
  })
})
