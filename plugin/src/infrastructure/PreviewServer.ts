import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { VaultFs } from '../ports/VaultFs.js'
import type { PublishOrchestrator } from '../domain/PublishOrchestrator.js'

import indexHtml from '../embedded/index.html'
import appJs from '../embedded/app.js.txt'
import styleCss from '../embedded/style.css'

export type PreviewServerOptions = {
  port?: number
  host?: string
}

export type PreviewServerStatus =
  | { state: 'stopped' }
  | { state: 'running'; url: string }

export class PreviewServer {
  private server: http.Server | null = null
  private status: PreviewServerStatus = { state: 'stopped' }

  constructor(
    private orchestrator: PublishOrchestrator,
    private vault: VaultFs,
    private options: PreviewServerOptions = {}
  ) {}

  getStatus(): PreviewServerStatus {
    return this.status
  }

  async start(): Promise<PreviewServerStatus> {
    if (this.server) return this.status
    const port = this.options.port ?? 4321
    const host = this.options.host ?? '127.0.0.1'

    const server = http.createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        console.error('notedrop preview: handler error', err)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        }
        res.end(`error: ${(err as Error).message}`)
      })
    })

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error & { code?: string }): void => {
        server.removeListener('listening', onListen)
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`port ${port} 이미 사용 중`))
        } else {
          reject(err)
        }
      }
      const onListen = (): void => {
        server.removeListener('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListen)
      server.listen(port, host)
    })

    this.server = server
    const addr = server.address() as AddressInfo
    this.status = { state: 'running', url: `http://${host}:${addr.port}` }
    return this.status
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve())
    })
    this.server = null
    this.status = { state: 'stopped' }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let pathname = decodeURIComponent(url.pathname)

    if (pathname === '/' || pathname === '/index.html') {
      return send(res, 200, 'text/html; charset=utf-8', indexHtml)
    }
    if (pathname === '/app.js') {
      return send(res, 200, 'application/javascript; charset=utf-8', appJs, true)
    }
    if (pathname === '/style.css') {
      return send(res, 200, 'text/css; charset=utf-8', styleCss, true)
    }

    if (pathname === '/manifest.json') {
      const plan = await this.orchestrator.plan()
      return send(
        res,
        200,
        'application/json; charset=utf-8',
        JSON.stringify(plan.manifest, null, 2),
        true
      )
    }

    const contentMatch = /^\/content\/([^/]+)\/index\.md$/.exec(pathname)
    if (contentMatch) {
      const hash = contentMatch[1]!
      const plan = await this.orchestrator.plan()
      const file = plan.files.find(
        (f) => f.kind === 'text' && f.path.endsWith(`/content/${hash}/index.md`)
      )
      if (!file || file.kind !== 'text') {
        return send(res, 404, 'text/plain; charset=utf-8', `not found: ${hash}`)
      }
      return send(res, 200, 'text/markdown; charset=utf-8', file.content, true)
    }

    const assetMatch = /^\/content\/([^/]+)\/_assets\/(.+)$/.exec(pathname)
    if (assetMatch) {
      const hash = assetMatch[1]!
      const basename = assetMatch[2]!
      const plan = await this.orchestrator.plan()
      const file = plan.files.find(
        (f) =>
          f.kind === 'binary' &&
          f.path.endsWith(`/content/${hash}/_assets/${basename}`)
      )
      if (!file || file.kind !== 'binary') {
        return send(res, 404, 'text/plain; charset=utf-8', `asset not found`)
      }
      const mime = guessMime(basename)
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'no-store'
      })
      res.end(Buffer.from(file.content))
      return
    }

    send(res, 404, 'text/plain; charset=utf-8', `not found: ${pathname}`)
  }
}

function send(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string,
  noStore = false
): void {
  const headers: Record<string, string> = { 'Content-Type': contentType }
  if (noStore) headers['Cache-Control'] = 'no-store'
  res.writeHead(status, headers)
  res.end(body)
}

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'svg': return 'image/svg+xml'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    default: return 'application/octet-stream'
  }
}
