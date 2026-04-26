import type { PublishedFile, PublishPlan } from '../domain/PublishOrchestrator.js'

export type GitHubPublisherConfig = {
  repo: string
  branch: string
  token: string
  apiBase?: string
}

export type PublishOutcome = {
  commitSha: string
  changedFiles: number
  url: string
  initialized: boolean
}

type Headers = Record<string, string>

export class GitHubAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubAuthError'
  }
}

export class GitHubApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'GitHubApiError'
  }
}

export class GitHubPublisher {
  private readonly apiBase: string
  private readonly owner: string
  private readonly repo: string

  constructor(private config: GitHubPublisherConfig) {
    this.apiBase = (config.apiBase ?? 'https://api.github.com').replace(/\/$/, '')
    const parts = config.repo.split('/')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`GitHubPublisher: repo must be "owner/name", got "${config.repo}"`)
    }
    this.owner = parts[0]
    this.repo = parts[1]
  }

  async publish(
    plan: PublishPlan,
    message = `notedrop publish ${new Date().toISOString()}`
  ): Promise<PublishOutcome> {
    if (plan.files.length === 0) {
      throw new Error('GitHubPublisher: empty publish plan')
    }
    const branch = this.config.branch

    let parentCommitSha: string | null = null
    let parentTreeSha: string | null = null
    let isEmpty = false

    try {
      const ref = await this.api<{ object: { sha: string } }>(
        `/repos/${this.owner}/${this.repo}/git/refs/heads/${branch}`
      )
      parentCommitSha = ref.object.sha
      const parentCommit = await this.api<{ tree: { sha: string } }>(
        `/repos/${this.owner}/${this.repo}/git/commits/${parentCommitSha}`
      )
      parentTreeSha = parentCommit.tree.sha
    } catch (err) {
      if (err instanceof GitHubApiError && (err.status === 404 || err.status === 409)) {
        isEmpty = true
      } else {
        throw err
      }
    }

    const treeEntries = []
    for (const file of plan.files) {
      const blobSha = await this.createBlob(file)
      treeEntries.push({
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blobSha
      })
    }

    const treeBody: Record<string, unknown> = { tree: treeEntries }
    if (parentTreeSha) treeBody.base_tree = parentTreeSha

    const tree = await this.api<{ sha: string }>(
      `/repos/${this.owner}/${this.repo}/git/trees`,
      'POST',
      treeBody
    )

    const commitBody: Record<string, unknown> = {
      message,
      tree: tree.sha
    }
    if (parentCommitSha) commitBody.parents = [parentCommitSha]

    const commit = await this.api<{ sha: string }>(
      `/repos/${this.owner}/${this.repo}/git/commits`,
      'POST',
      commitBody
    )

    if (isEmpty) {
      await this.api(
        `/repos/${this.owner}/${this.repo}/git/refs`,
        'POST',
        { ref: `refs/heads/${branch}`, sha: commit.sha }
      )
    } else {
      await this.api(
        `/repos/${this.owner}/${this.repo}/git/refs/heads/${branch}`,
        'PATCH',
        { sha: commit.sha, force: false }
      )
    }

    return {
      commitSha: commit.sha,
      changedFiles: plan.files.length,
      url: `https://github.com/${this.owner}/${this.repo}/commit/${commit.sha}`,
      initialized: isEmpty
    }
  }

  private async createBlob(file: PublishedFile): Promise<string> {
    if (file.kind === 'cached') {
      // PlanFactory v0.1.45: cached entry 는 base_tree 보존 의도라 push 안
      // 대상. publishVault 가 변경 감지 filter + 안전 가드로 차단해야 함.
      // 여기 도달 시 호출 측 버그 — 명시 throw.
      throw new Error(
        `GitHubPublisher: cached entry "${file.path}" 가 push 대상에 도달 — ` +
        `상위 호출자 (publishVault) 의 cached filter 누락. 코드 버그.`
      )
    }
    const body =
      file.kind === 'text'
        ? { content: file.content, encoding: 'utf-8' }
        : { content: bytesToBase64(file.content), encoding: 'base64' }
    const result = await this.api<{ sha: string }>(
      `/repos/${this.owner}/${this.repo}/git/blobs`,
      'POST',
      body
    )
    return result.sha
  }

  private async api<T = unknown>(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
    body?: unknown
  ): Promise<T> {
    const url = `${this.apiBase}${path}`
    const headers: Headers = {
      Authorization: `Bearer ${this.config.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`
      try {
        const err = (await response.json()) as { message?: string }
        if (err.message) message = err.message
      } catch {}
      if (response.status === 401 || response.status === 403) {
        throw new GitHubAuthError(message)
      }
      throw new GitHubApiError(response.status, message)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  if (typeof btoa === 'function') return btoa(binary)
  return Buffer.from(binary, 'binary').toString('base64')
}
