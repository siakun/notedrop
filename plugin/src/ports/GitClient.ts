export type GitAuth = { username: string, token: string }
export type GitAuthor = { name: string, email: string }

export interface GitClient {
  clone(repoUrl: string, dest: string, auth: GitAuth): Promise<void>
  add(dest: string, paths: string[]): Promise<void>
  commit(dest: string, message: string, author: GitAuthor): Promise<void>
  push(dest: string, auth: GitAuth): Promise<void>
}
