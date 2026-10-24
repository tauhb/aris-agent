/**
 * Bộ chuyển tự viết cho Claude Code (bước 4b; bản vẽ 2.1c): chạy `claude` có sẵn trên máy ở chế độ
 * không giao diện (`-p --output-format stream-json`), đọc luồng sự kiện thành từng bước trên nhánh,
 * chuyển câu hỏi xin quyền cho người dùng qua máy chủ MCP `bin/approve-mcp.mjs`, dừng ở trần tiền
 * (`--max-budget-usd`), làm tiếp phiên cũ bằng `--resume`.
 */
import { spawn } from 'node:child_process'
import { isAbsolute, relative } from 'node:path'
import { createInterface } from 'node:readline'

export type StepKind =
  | 'read'
  | 'edit'
  | 'write'
  | 'run'
  | 'search'
  | 'find'
  | 'web'
  | 'webSearch'
  | 'todo'
  | 'agent'
  | 'permission'
  | 'other'

/** Một bước của bot ngoài trên nhánh: làm gì, với cái gì, xong chưa. */
export interface Step {
  id: string
  kind: StepKind
  /** Tệp, lệnh, mẫu tìm… (đã rút gọn). */
  target?: string
  /** Tên công cụ gốc khi kind là `other`. */
  tool?: string
  status: 'running' | 'done' | 'failed'
  at: string
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Đường dẫn ngắn: tương đối với thư mục làm việc khi nằm trong đó. */
export function shortPath(p: string, cwd?: string): string {
  if (!cwd || !isAbsolute(p)) return p
  const r = relative(cwd, p)
  return r && !r.startsWith('..') ? r : p
}

/** Một lần gọi công cụ của Claude Code thành bước có nghĩa. */
export function stepOf(tool: string, input: unknown, cwd?: string): Pick<Step, 'kind' | 'target' | 'tool'> {
  const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const s = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '')
  const file = shortPath(s('file_path') || s('notebook_path') || s('path'), cwd)
  switch (tool) {
    case 'Read':
      return { kind: 'read', target: file }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { kind: 'edit', target: file }
    case 'Write':
      return { kind: 'write', target: file }
    case 'Bash':
    case 'PowerShell':
      return { kind: 'run', target: clip(s('command').split('\n')[0]!, 120) }
    case 'Grep':
      return { kind: 'search', target: clip(s('pattern'), 80) }
    case 'Glob':
    case 'LS':
      return { kind: 'find', target: clip(s('pattern') || file, 80) }
    case 'WebFetch':
      return { kind: 'web', target: clip(s('url'), 100) }
    case 'WebSearch':
      return { kind: 'webSearch', target: clip(s('query'), 100) }
    case 'TodoWrite':
      return { kind: 'todo' }
    case 'Permissions':
      return { kind: 'permission', target: clip(s('path'), 160) }
    case 'Task':
    case 'Agent':
      return { kind: 'agent', target: clip(s('description'), 80) }
    default:
      return { kind: 'other', tool }
  }
}

export interface ClaudeOptions {
  prompt: string
  /** Mức quyền (`--permission-mode`): manual, acceptEdits, dontAsk, auto, plan, bypassPermissions. */
  permission: string
  model?: string | undefined
  budgetUsd?: number | undefined
  /** Phiên Claude Code để làm tiếp. */
  resume?: string | undefined
  /** Cấu hình MCP (chuỗi JSON) có máy chủ duyệt quyền `aris`. */
  mcpConfig: string
}

/** Tham số dòng lệnh cho một lần chạy. */
export function claudeArgs(o: ClaudeOptions): string[] {
  const args = [
    '-p',
    o.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    o.permission,
  ]
  if (o.permission !== 'bypassPermissions')
    args.push('--permission-prompt-tool', 'mcp__aris__approve', '--mcp-config', o.mcpConfig)
  if (o.model) args.push('--model', o.model)
  if (o.budgetUsd) args.push('--max-budget-usd', String(o.budgetUsd))
  if (o.resume) args.push('--resume', o.resume)
  return args
}

/** Biến môi trường cho tiến trình agent: bỏ khoá, token (agent dùng đăng nhập riêng của nó). */
export function childEnv(env: NodeJS.ProcessEnv, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(env))
    if (!/(KEY|TOKEN|SECRET|PASSWORD)$/i.test(k) && !k.startsWith('DSH_')) out[k] = v
  return { ...out, ...extra }
}

export interface DriverHooks {
  step(s: Step): void
  stepEnd(id: string, status: Step['status']): void
  cost(usd: number): void
  session(ref: string): void
}

export interface DriverResult {
  status: 'done' | 'failed' | 'stopped'
  output: string
  costUsd?: number | undefined
  sessionRef?: string | undefined
  /** Vì sao vấp (ngắn, không có nội dung việc). */
  diagnostic?: string | undefined
}

/** Đọc luồng sự kiện của Claude Code; giữ trạng thái giữa các dòng. */
export class ClaudeStream {
  private open = new Map<string, string>()
  output = ''
  lastText = ''
  costUsd: number | undefined
  sessionRef: string | undefined
  result: { subtype: string; isError: boolean } | undefined

  constructor(
    private hooks: DriverHooks,
    private cwd?: string,
    private now = () => new Date(),
  ) {}

  line(raw: string) {
    let e: Record<string, unknown>
    try {
      e = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    const sid = typeof e.session_id === 'string' ? e.session_id : undefined
    if (sid && sid !== this.sessionRef) {
      this.sessionRef = sid
      this.hooks.session(sid)
    }
    const content = ((e.message as { content?: unknown } | undefined)?.content ?? []) as Record<
      string,
      unknown
    >[]
    if (e.type === 'assistant' && Array.isArray(content)) {
      for (const c of content) {
        if (c.type === 'text' && typeof c.text === 'string' && c.text.trim()) this.lastText = c.text
        if (c.type === 'tool_use' && typeof c.id === 'string' && typeof c.name === 'string') {
          this.open.set(c.id, c.id)
          this.hooks.step({
            id: c.id,
            ...stepOf(c.name, c.input, this.cwd),
            status: 'running',
            at: this.now().toISOString(),
          })
        }
      }
    } else if (e.type === 'user' && Array.isArray(content)) {
      for (const c of content)
        if (c.type === 'tool_result' && typeof c.tool_use_id === 'string' && this.open.delete(c.tool_use_id))
          this.hooks.stepEnd(c.tool_use_id, c.is_error === true ? 'failed' : 'done')
    } else if (e.type === 'result') {
      if (typeof e.total_cost_usd === 'number') {
        this.costUsd = e.total_cost_usd
        this.hooks.cost(e.total_cost_usd)
      }
      if (typeof e.result === 'string') this.output = e.result
      this.result = { subtype: String(e.subtype ?? ''), isError: e.is_error === true }
    }
  }

  /** Kết quả khi tiến trình kết thúc. */
  finish(code: number | null, stopped: boolean, stderr: string, budgetUsd?: number): DriverResult {
    for (const id of this.open.keys()) this.hooks.stepEnd(id, stopped ? 'failed' : 'done')
    this.open.clear()
    const output = (this.output || this.lastText).trim()
    const base = { output, costUsd: this.costUsd, sessionRef: this.sessionRef }
    if (stopped) return { ...base, status: 'stopped' }
    const r = this.result
    if (r && r.subtype === 'success' && !r.isError) return { ...base, status: 'done' }
    const diagnostic = !r
      ? `claude thoát (mã ${code ?? '?'}) không có kết quả${stderr.trim() ? `: ${clip(stderr.trim().split('\n').pop()!, 200)}` : ''}`
      : r.subtype === 'error_max_budget_usd'
        ? `Chạm trần tiền${budgetUsd ? ` ${budgetUsd} USD` : ''}`
        : r.subtype === 'error_max_turns'
          ? 'Chạm số lượt tối đa'
          : `Claude Code báo lỗi (${r.subtype || 'không rõ'})`
    return { ...base, status: 'failed', diagnostic }
  }
}

export interface RunClaudeInput extends ClaudeOptions {
  bin: string
  cwd?: string | undefined
  env: NodeJS.ProcessEnv
  signal: AbortSignal
}

/** Chạy `claude` một lần (hoặc làm tiếp phiên cũ) tới khi xong, vấp hay bị dừng. */
export function runClaude(o: RunClaudeInput, hooks: DriverHooks): Promise<DriverResult> {
  return new Promise((resolve) => {
    const stream = new ClaudeStream(hooks, o.cwd)
    const child = spawn(o.bin, claudeArgs(o), {
      cwd: o.cwd,
      env: o.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    let stopped = false
    child.on('error', () => undefined)
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (d: string) => (stderr = (stderr + d).slice(-4000)))
    createInterface({ input: child.stdout }).on('line', (l) => stream.line(l))
    const stop = () => {
      stopped = true
      child.kill('SIGTERM')
      setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 5000).unref()
    }
    if (o.signal.aborted) stop()
    else o.signal.addEventListener('abort', stop, { once: true })
    child.on('error', (e) => {
      o.signal.removeEventListener('abort', stop)
      resolve({ status: 'failed', output: '', diagnostic: `Không chạy được claude: ${e.message}` })
    })
    child.on('close', (code) => {
      o.signal.removeEventListener('abort', stop)
      resolve(stream.finish(code, stopped, stderr, o.budgetUsd))
    })
  })
}
