/**
 * Socket cục bộ của aris (`~/.aris/run/<băm>.sock`, quyền 0600): HTTP qua Unix socket, không qua
 * mạng nên không cần token, chỉ tài khoản của chủ máy mở được. Phục vụ lệnh `aris`.
 */
import { chmod, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { connect } from 'node:net'

export interface AskResult {
  sessionId: string
  text: string
  reason: string
}

/** Những gì socket cần từ máy chủ dsh (truyền vào để kiểm thử bằng bản giả). */
export interface DaemonPort {
  status(): Record<string, unknown>
  loginUrl(): string
  send(text: string): Promise<string>
  ask(text: string, signal: AbortSignal): Promise<AskResult>
  stop(): void
}

/** Câu giao việc tối đa (đủ cho mọi lệnh gõ tay hay script cron). */
const MAX_BODY = 200_000

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (b: Buffer) => {
      size += b.length
      if (size > MAX_BODY) {
        reject(new Error('nội dung quá dài'))
        req.destroy()
      } else chunks.push(b)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      } catch {
        reject(new Error('JSON không hợp lệ'))
      }
    })
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export async function handle(port: DaemonPort, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '/').split('?')[0]
  try {
    if (req.method === 'GET' && path === '/status') return send(res, 200, port.status())
    if (req.method !== 'POST') return send(res, 405, { error: 'chỉ GET /status và POST' })
    const body = await readBody(req)
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    switch (path) {
      case '/login':
        return send(res, 200, { url: port.loginUrl() })
      case '/send':
        if (!text) return send(res, 400, { error: 'thiếu nội dung' })
        return send(res, 200, { result: await port.send(text) })
      case '/ask': {
        if (!text) return send(res, 400, { error: 'thiếu việc cần làm' })
        // Người gọi ngắt kết nối (Ctrl-C) thì dừng lượt.
        const abort = new AbortController()
        res.on('close', () => {
          if (!res.writableFinished) abort.abort()
        })
        return send(res, 200, await port.ask(text, abort.signal))
      }
      case '/stop':
        send(res, 200, { stopping: true })
        setTimeout(() => port.stop(), 100)
        return
      default:
        return send(res, 404, { error: 'không có đường này' })
    }
  } catch (err) {
    return send(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}

/** Có tiến trình đang nghe ở socket này không (tệp còn nhưng không ai nghe là của bản đã văng). */
export function alive(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = connect(path)
    s.once('connect', () => (s.destroy(), resolve(true)))
    s.once('error', () => resolve(false))
  })
}

/**
 * Mở socket. Bản aris khác đang giữ (ví dụ daemon, khi một bản ACP cũng nạp plugin này) thì
 * không chiếm; tệp socket cũ của bản đã văng thì xoá.
 */
export async function listen(path: string, port: DaemonPort): Promise<Server> {
  if (await alive(path)) throw new Error('đã có bản aris khác giữ socket')
  await rm(path, { force: true })
  const server = createServer((req, res) => void handle(port, req, res))
  // `/ask` có thể chạy lâu: không cắt kết nối giữa chừng.
  server.requestTimeout = 0
  server.headersTimeout = 60_000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, () => resolve())
  })
  await chmod(path, 0o600)
  return server
}

export async function close(server: Server, path: string) {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(path, { force: true })
}
