import { describe, expect, it } from 'vitest'
import { COMMAND_REGISTRY } from './registry.js'

describe('COMMAND_REGISTRY', () => {
  it('does not expose dangerous baseline reset command in production registry', () => {
    expect(COMMAND_REGISTRY.map((cmd) => cmd.id)).not.toContain('reset-publish-baseline')
  })
})
