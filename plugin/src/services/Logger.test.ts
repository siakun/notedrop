import { describe, expect, it, vi } from 'vitest'
import { ConsoleLogger } from './Logger.js'

describe('ConsoleLogger secret redaction', () => {
  it('masks githubPat and token-like fields before console output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const logger = new ConsoleLogger('0.1.47')

    logger.info('test', 'settings dump', {
      githubPat: 'ghp_secret123456789',
      token: 'token_secret_123456',
      visible: 'ok'
    })

    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('ghp_***89')
    expect(output).toContain('toke***56')
    expect(output).toContain('"visible": "ok"')
    expect(output).not.toContain('ghp_secret123456789')
    expect(output).not.toContain('token_secret_123456')
    spy.mockRestore()
  })
})
