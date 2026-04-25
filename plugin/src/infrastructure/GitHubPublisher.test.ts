import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GitHubPublisher, GitHubAuthError, GitHubApiError } from './GitHubPublisher.js'
import type { PublishPlan } from '../domain/PublishOrchestrator.js'

const samplePlan: PublishPlan = {
  files: [
    { kind: 'text', path: 'viewer/public/manifest.json', content: '{"v":1}' },
    { kind: 'binary', path: 'viewer/public/img.png', content: new Uint8Array([1, 2, 3, 4]) }
  ],
  manifest: {
    version: 1,
    generatedAt: '2026-01-01T00:00:00Z',
    generatedBy: 'test',
    items: []
  },
  warnings: []
}

describe('GitHubPublisher', () => {
  let originalFetch: typeof globalThis.fetch
  let publisher: GitHubPublisher

  beforeEach(() => {
    originalFetch = globalThis.fetch
    publisher = new GitHubPublisher({
      repo: 'siakun/notedrop',
      branch: 'main',
      token: 'test-token'
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('repo 형식 잘못되면 생성 시 throw', () => {
    expect(() => new GitHubPublisher({
      repo: 'invalid',
      branch: 'main',
      token: 't'
    })).toThrow(/owner\/name/)
  })

  it('Tree API 시퀀스 호출 + commit sha 반환', async () => {
    const calls: { url: string; method: string; body?: unknown }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      calls.push({
        url: u,
        method,
        body: init?.body ? JSON.parse(init.body as string) : undefined
      })
      if (u.endsWith('/refs/heads/main') && method === 'GET') {
        return jsonResponse({ object: { sha: 'parent-sha' } })
      }
      if (u.endsWith('/commits/parent-sha') && method === 'GET') {
        return jsonResponse({ tree: { sha: 'parent-tree' } })
      }
      if (u.endsWith('/blobs') && method === 'POST') {
        return jsonResponse({ sha: 'blob-' + calls.length })
      }
      if (u.endsWith('/trees') && method === 'POST') {
        return jsonResponse({ sha: 'new-tree' })
      }
      if (u.endsWith('/commits') && method === 'POST') {
        return jsonResponse({ sha: 'new-commit' })
      }
      if (u.endsWith('/refs/heads/main') && method === 'PATCH') {
        return jsonResponse({ ref: 'refs/heads/main' })
      }
      throw new Error(`unexpected: ${method} ${u}`)
    })
    globalThis.fetch = fetchMock as never

    const outcome = await publisher.publish(samplePlan, 'test commit')
    expect(outcome.commitSha).toBe('new-commit')
    expect(outcome.changedFiles).toBe(2)
    expect(outcome.url).toContain('siakun/notedrop')
    expect(calls.find((c) => c.url.endsWith('/trees'))?.body).toMatchObject({
      base_tree: 'parent-tree',
      tree: expect.arrayContaining([
        expect.objectContaining({ path: 'viewer/public/manifest.json', mode: '100644' })
      ])
    })
  })

  it('binary 파일은 base64 인코딩', async () => {
    let blobBody: { content: string; encoding: string } | null = null
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      if (u.endsWith('/blobs') && method === 'POST') {
        const body = JSON.parse(init!.body as string)
        if (body.encoding === 'base64') blobBody = body
        return jsonResponse({ sha: 'blob-x' })
      }
      if (u.endsWith('/refs/heads/main') && method === 'GET')
        return jsonResponse({ object: { sha: 'p' } })
      if (u.endsWith('/commits/p') && method === 'GET')
        return jsonResponse({ tree: { sha: 't' } })
      if (u.endsWith('/trees') && method === 'POST')
        return jsonResponse({ sha: 'nt' })
      if (u.endsWith('/commits') && method === 'POST')
        return jsonResponse({ sha: 'nc' })
      if (u.endsWith('/refs/heads/main') && method === 'PATCH')
        return jsonResponse({})
      throw new Error(u)
    })
    globalThis.fetch = fetchMock as never
    await publisher.publish(samplePlan, 'binary test')
    expect(blobBody).not.toBeNull()
    expect(blobBody!.content).toBe('AQIDBA==')
  })

  it('401 응답 → GitHubAuthError', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ message: 'Bad credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }) as never
    await expect(publisher.publish(samplePlan)).rejects.toBeInstanceOf(GitHubAuthError)
  })

  it('500 응답 → GitHubApiError', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ message: 'Server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }) as never
    await expect(publisher.publish(samplePlan)).rejects.toBeInstanceOf(GitHubApiError)
  })

  it('빈 plan → throw', async () => {
    await expect(
      publisher.publish({ files: [], manifest: samplePlan.manifest, warnings: [] })
    ).rejects.toThrow(/empty/)
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
