import { describe, it, expect } from 'vitest'
import { FakeGitClient } from './FakeGitClient.js'

const auth = { username: 'username', token: 'ghp_test' }
const author = { name: 'Username', email: 'username@example.com' }

describe('FakeGitClient', () => {
  it('clone records call', async () => {
    const git = new FakeGitClient()
    await git.clone('https://example.com/repo.git', '/tmp/work', auth)
    expect(git.calls).toEqual([
      { op: 'clone', repoUrl: 'https://example.com/repo.git', dest: '/tmp/work', auth }
    ])
  })

  it('add records paths', async () => {
    const git = new FakeGitClient()
    await git.add('/tmp/work', ['a.md', 'b.md'])
    expect(git.calls).toEqual([
      { op: 'add', dest: '/tmp/work', paths: ['a.md', 'b.md'] }
    ])
  })

  it('commit records message and author', async () => {
    const git = new FakeGitClient()
    await git.commit('/tmp/work', 'msg', author)
    expect(git.calls).toEqual([
      { op: 'commit', dest: '/tmp/work', message: 'msg', author }
    ])
  })

  it('push records call', async () => {
    const git = new FakeGitClient()
    await git.push('/tmp/work', auth)
    expect(git.calls).toEqual([{ op: 'push', dest: '/tmp/work', auth }])
  })

  it('records calls in invocation order', async () => {
    const git = new FakeGitClient()
    await git.clone('url', '/d', auth)
    await git.add('/d', ['x'])
    await git.commit('/d', 'm', author)
    await git.push('/d', auth)
    expect(git.calls.map((c) => c.op)).toEqual(['clone', 'add', 'commit', 'push'])
  })

  it('fail() injects rejection on next op', async () => {
    const git = new FakeGitClient()
    git.fail('push', new Error('non-fast-forward'))
    await expect(git.push('/d', auth)).rejects.toThrow('non-fast-forward')
    await expect(git.push('/d', auth)).resolves.toBeUndefined()
  })

  it('reset() clears calls and pending failures', async () => {
    const git = new FakeGitClient()
    await git.push('/d', auth)
    git.fail('push', new Error('x'))
    git.reset()
    expect(git.calls).toEqual([])
    await expect(git.push('/d', auth)).resolves.toBeUndefined()
  })
})
