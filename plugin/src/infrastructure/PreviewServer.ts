import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { unzipSync, strToU8 } from 'fflate'
import type { VaultFs } from '../ports/VaultFs.js'
import type { PublishOrchestrator } from '../domain/PublishOrchestrator.js'
import type { PublishIndex } from '../domain/PublishIndex.js'

import viewerZipB64 from '../embedded/viewer.zip.b64'

export type PreviewServerOptions = {
  port?: number
  host?: string
  onPreviewError?: (category: string, msg: string, data?: Record<string, unknown>) => void
  /** Override embedded viewer.zip base64. dev sidecar 가 ''(empty) 를 넘기면
   * viewer asset 서빙은 자동 skip — Next dev 가 viewer 페이지 자체를 서빙. */
  viewerZipB64?: string
}

export type PreviewServerStatus =
  | { state: 'stopped' }
  | { state: 'running'; url: string }

type SsePayload = { event: 'added' | 'changed' | 'removed'; hash: string }

const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  map: 'application/json; charset=utf-8'
}

export class PreviewServer {
  private server: http.Server | null = null
  private status: PreviewServerStatus = { state: 'stopped' }
  private subscribers = new Set<ServerResponse>()
  private indexUnsubs: Array<() => void> = []
  private keepAlive: ReturnType<typeof setInterval> | null = null
  private viewerAssets: Map<string, Uint8Array> | null = null

  constructor(
    private orchestrator: PublishOrchestrator,
    private vault: VaultFs,
    private index: PublishIndex,
    private options: PreviewServerOptions = {}
  ) {}

  private emitError(category: string, msg: string, data?: Record<string, unknown>): void {
    console.error(`[preview] ${category}: ${msg}`, data ?? '')
    this.options.onPreviewError?.(category, msg, data)
  }

  getStatus(): PreviewServerStatus {
    return this.status
  }

  async start(): Promise<PreviewServerStatus> {
    if (this.server) return this.status
    const port = this.options.port ?? 4321
    const host = this.options.host ?? '127.0.0.1'

    const zipSource = this.options.viewerZipB64 ?? viewerZipB64
    this.viewerAssets = unpackViewerZip(zipSource, this.options.onPreviewError)

    const server = http.createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        this.emitError('handler', 'request handler error', { message: (err as Error).message })
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

    this.subscribeIndex()
    this.startKeepAlive()

    return this.status
  }

  async stop(): Promise<void> {
    if (!this.server) return

    for (const unsub of this.indexUnsubs) unsub()
    this.indexUnsubs = []

    if (this.keepAlive) {
      clearInterval(this.keepAlive)
      this.keepAlive = null
    }

    for (const res of this.subscribers) {
      try { res.end() } catch {}
    }
    this.subscribers.clear()

    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve())
    })
    this.server = null
    this.status = { state: 'stopped' }
    this.viewerAssets = null
  }

  private subscribeIndex(): void {
    const events: SsePayload['event'][] = ['added', 'changed', 'removed']
    for (const ev of events) {
      const unsub = this.index.on(ev, (hash) => {
        this.broadcast({ event: ev, hash })
      })
      this.indexUnsubs.push(unsub)
    }
  }

  private startKeepAlive(): void {
    this.keepAlive = setInterval(() => {
      for (const res of this.subscribers) {
        try { res.write(': ping\n\n') } catch {}
      }
    }, 25000)
  }

  private broadcast(payload: SsePayload): void {
    const data = `event: ${payload.event}\ndata: ${JSON.stringify({ hash: payload.hash })}\n\n`
    for (const res of this.subscribers) {
      try { res.write(data) } catch {}
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname = stripBasePath(decodeURIComponent(url.pathname))

    if (pathname === '/events' || pathname === '/events/') return this.handleEvents(req, res)

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
      const suffix = `content/${hash}/index.md`
      const file = plan.files.find(
        (f) =>
          f.kind === 'text' &&
          (f.path === suffix || f.path.endsWith(`/${suffix}`))
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
      const suffix = `content/${hash}/_assets/${basename}`
      const file = plan.files.find(
        (f) =>
          f.kind === 'binary' &&
          (f.path === suffix || f.path.endsWith(`/${suffix}`))
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

    if (this.serveViewerAsset(pathname, res)) return

    send(res, 404, 'text/plain; charset=utf-8', `not found: ${pathname}`)
  }

  private serveViewerAsset(pathname: string, res: ServerResponse): boolean {
    if (!this.viewerAssets) return false

    const candidates = candidatePaths(pathname)
    for (const cand of candidates) {
      const bytes = this.viewerAssets.get(cand)
      if (bytes) {
        const mime = guessMime(cand)
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'no-store'
        })
        res.end(Buffer.from(bytes))
        return true
      }
    }
    return false
  }

  private handleEvents(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.write('retry: 3000\n\n')
    res.write('event: hello\ndata: {}\n\n')

    this.subscribers.add(res)

    const cleanup = (): void => {
      this.subscribers.delete(res)
    }
    req.on('close', cleanup)
    req.on('error', cleanup)
  }
}

const BASE_PATHS = ['/__NOTEDROP_BASE__', '/notedrop']

function stripBasePath(pathname: string): string {
  for (const base of BASE_PATHS) {
    if (pathname === base) return '/'
    if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length)
  }
  return pathname
}

function candidatePaths(pathname: string): string[] {
  const trimmed = pathname.replace(/^\/+/, '')
  const candidates = new Set<string>()
  if (trimmed) candidates.add(trimmed)
  if (trimmed === '' || trimmed.endsWith('/')) {
    candidates.add(`${trimmed}index.html`)
  }
  if (!trimmed.includes('.') && !trimmed.endsWith('/')) {
    candidates.add(`${trimmed}/index.html`)
    candidates.add(`${trimmed}.html`)
  }
  return [...candidates]
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
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

function unpackViewerZip(
  b64: string,
  onError?: (category: string, msg: string, data?: Record<string, unknown>) => void
): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  if (!b64 || !b64.trim()) return out
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(b64.trim())
  } catch (err) {
    const msg = 'viewer.zip base64 decode 실패'
    console.warn(`notedrop preview: ${msg}`, err)
    onError?.('viewer_zip', msg, { message: (err as Error).message })
    return out
  }
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch (err) {
    const msg = 'viewer.zip 압축 해제 실패'
    console.warn(`notedrop preview: ${msg}`, err)
    onError?.('viewer_zip', msg, { message: (err as Error).message })
    return out
  }
  for (const [path, content] of Object.entries(entries)) {
    out.set(path, content)
  }
  return out
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'))
  }
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

// keep `strToU8` import valid for type-checking unused branches
void strToU8
