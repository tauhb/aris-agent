/**
 * Hỏi người dùng khi bot ngoài xin quyền (bản vẽ 2.1c, thẻ duyệt trên nhánh). Agent ngoài gửi yêu
 * cầu qua socket cục bộ (máy chủ MCP `bin/approve-mcp.mjs` cho Claude Code); aris giữ yêu cầu chờ
 * tới khi người dùng bấm Cho phép / Từ chối, hết hạn thì từ chối.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Không trả lời sau ngần này thì từ chối (kế hoạch: hết hạn ⇒ từ chối). */
export const APPROVAL_TIMEOUT_MS = 15 * 60_000

export interface ApprovalRequest {
  id: string
  run: string
  tool: string
  input: unknown
  at: string
}

export interface ApprovalPort {
  /** Có yêu cầu mới cho một lần chạy (ghi lên bản ghi để giao diện vẽ thẻ duyệt). */
  opened(req: ApprovalRequest): void
  /** Yêu cầu đã xong (người dùng trả lời, hết hạn, lần chạy kết thúc). */
  closed(req: ApprovalRequest, allow: boolean, by: 'user' | 'timeout' | 'ended'): void
}

interface Pending {
  req: ApprovalRequest
  answer(allow: boolean, message?: string): void
  timer: ReturnType<typeof setTimeout>
}

/** Đường socket ngắn (macOS giới hạn 104 ký tự), mỗi tiến trình một socket. */
export const approvalSocketPath = (home = homedir(), pid = process.pid) =>
  join(home, '.aris', 'run', `ap-${pid}.sock`)

export class ApprovalHub {
  private pending = new Map<string, Pending>()
  private server: Server | undefined
  readonly path: string

  constructor(
    private port: ApprovalPort,
    path = approvalSocketPath(),
    private timeoutMs = APPROVAL_TIMEOUT_MS,
  ) {
    this.path = path
  }

  start(): Promise<void> {
    mkdirSync(join(this.path, '..'), { recursive: true })
    if (existsSync(this.path)) rmSync(this.path)
    this.server = createServer((s) => this.serve(s))
    return new Promise((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.path, () => resolve())
    })
  }

  stop() {
    for (const p of this.pending.values()) this.settle(p, false, 'ended')
    this.server?.close()
    if (existsSync(this.path)) rmSync(this.path)
  }

  /** Yêu cầu đang chờ của một lần chạy. */
  of(run: string): ApprovalRequest[] {
    return [...this.pending.values()].filter((p) => p.req.run === run).map((p) => p.req)
  }

  /** Người dùng trả lời; trả false khi yêu cầu không còn chờ. */
  answer(id: string, allow: boolean): boolean {
    const p = this.pending.get(id)
    if (!p) return false
    this.settle(p, allow, 'user')
    return true
  }

  /** Lần chạy kết thúc: từ chối mọi yêu cầu còn chờ của nó. */
  endRun(run: string) {
    for (const p of [...this.pending.values()]) if (p.req.run === run) this.settle(p, false, 'ended')
  }

  /** Nhận một yêu cầu (dùng chung cho socket và cho agent nói chuyện trực tiếp, như Codex). */
  request(run: string, tool: string, input: unknown): Promise<boolean> {
    return new Promise((resolve) => {
      const req: ApprovalRequest = { id: randomUUID(), run, tool, input, at: new Date().toISOString() }
      const p: Pending = {
        req,
        answer: (allow) => resolve(allow),
        timer: setTimeout(() => this.settle(p, false, 'timeout'), this.timeoutMs),
      }
      this.pending.set(req.id, p)
      this.port.opened(req)
    })
  }

  private settle(p: Pending, allow: boolean, by: 'user' | 'timeout' | 'ended') {
    if (!this.pending.delete(p.req.id)) return
    clearTimeout(p.timer)
    p.answer(allow)
    this.port.closed(p.req, allow, by)
  }

  private serve(s: Socket) {
    let buf = ''
    s.setEncoding('utf8')
    s.on('error', () => undefined)
    s.on('data', (d) => {
      buf += d
      const i = buf.indexOf('\n')
      if (i < 0) return
      let msg: { run?: string; tool_name?: string; input?: unknown }
      try {
        msg = JSON.parse(buf.slice(0, i)) as typeof msg
      } catch {
        s.end(JSON.stringify({ allow: false, message: 'Yêu cầu không hợp lệ.' }) + '\n')
        return
      }
      if (!msg.run || !msg.tool_name) {
        s.end(JSON.stringify({ allow: false, message: 'Thiếu lần chạy hoặc công cụ.' }) + '\n')
        return
      }
      void this.request(msg.run, msg.tool_name, msg.input ?? {}).then((allow) =>
        s.end(
          JSON.stringify(allow ? { allow: true } : { allow: false, message: 'Người dùng không cho phép.' }) +
            '\n',
        ),
      )
    })
  }
}
