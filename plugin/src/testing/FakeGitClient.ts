import type {
  GitClient,
  GitAuth,
  GitAuthor
} from '../ports/GitClient.js'

export type GitCall =
  | { op: 'clone', repoUrl: string, dest: string, auth: GitAuth }
  | { op: 'add', dest: string, paths: string[] }
  | { op: 'commit', dest: string, message: string, author: GitAuthor }
  | { op: 'push', dest: string, auth: GitAuth }

type GitOp = GitCall['op']

export class FakeGitClient implements GitClient {
  calls: GitCall[] = []
  private pendingFailures: Map<GitOp, Error> = new Map()

  async clone(repoUrl: string, dest: string, auth: GitAuth): Promise<void> {
    this.maybeThrow('clone')
    this.calls.push({ op: 'clone', repoUrl, dest, auth })
  }

  async add(dest: string, paths: string[]): Promise<void> {
    this.maybeThrow('add')
    this.calls.push({ op: 'add', dest, paths })
  }

  async commit(dest: string, message: string, author: GitAuthor): Promise<void> {
    this.maybeThrow('commit')
    this.calls.push({ op: 'commit', dest, message, author })
  }

  async push(dest: string, auth: GitAuth): Promise<void> {
    this.maybeThrow('push')
    this.calls.push({ op: 'push', dest, auth })
  }

  fail(op: GitOp, error: Error): void {
    this.pendingFailures.set(op, error)
  }

  reset(): void {
    this.calls = []
    this.pendingFailures.clear()
  }

  private maybeThrow(op: GitOp): void {
    const err = this.pendingFailures.get(op)
    if (err) {
      this.pendingFailures.delete(op)
      throw err
    }
  }
}
