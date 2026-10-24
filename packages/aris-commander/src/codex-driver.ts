/**
 * Bộ chuyển tự viết cho Codex (bước 4b; bản vẽ 2.1c): chạy `codex app-server` có sẵn trên máy, giao
 * thức JSON từng dòng (sinh từ chính bản đang cài: `codex app-server generate-ts`). Mỗi việc một lượt
 * trên một thread (làm tiếp bằng `thread/resume`); lệnh và sửa tệp thành từng bước; Codex xin quyền
 * thì hỏi người dùng qua `ApprovalHub`.
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { shortPath, type DriverHooks, type DriverResult, type Step } from './claude-driver.js'

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Mức quyền của bot thành chính sách duyệt và sandbox của Codex. */
export function codexPolicy(permission: string): {
  approvalPolicy: string
  sandbox?: string
  approvalsReviewer?: string
} {
  switch (permission) {
    case 'ask':
      return { approvalPolicy: 'untrusted', sandbox: 'workspace-write' }
    case 'approve-for-me':
      return { approvalPolicy: 'on-request', sandbox: 'workspace-write', approvalsReviewer: 'auto_review' }
    case 'dangerously-bypass-approvals-and-sandbox':
      return { approvalPolicy: 'never', sandbox: 'danger-full-access' }
    default:
      return { approvalPolicy: 'never' }
  }
}

interface Item {
  type: string
  id: string
  command?: string
  changes?: { path: string }[]
  text?: string
  phase?: string | null
  status?: string
  exitCode?: number | null
  tool?: string
  server?: string
  query?: string
}

/** Một mục của Codex thành các bước (một lệnh, mỗi tệp đổi một bước). */
export function stepsOfItem(item: Item, cwd?: string): Omit<Step, 'status' | 'at'>[] {
  switch (item.type) {
    case 'commandExecution':
      return [{ id: item.id, kind: 'run', target: clip((item.command ?? '').split('\n')[0]!, 120) }]
    case 'fileChange':
      return (item.changes ?? []).map((c, i) => ({
        id: `${item.id}#${i}`,
        kind: 'edit' as const,
        target: shortPath(c.path, cwd),
      }))
    case 'webSearch':
      return [{ id: item.id, kind: 'webSearch', target: clip(item.query ?? '', 100) }]
    case 'mcpToolCall':
    case 'dynamicToolCall':
      return [{ id: item.id, kind: 'other', tool: item.tool ?? item.server ?? item.type }]
    default:
      return []
  }
}

/** Mục kết thúc thất bại (lệnh lỗi, sửa tệp không áp được). */
const itemFailed = (item: Item) =>
  item.status === 'failed' ||
  item.status === 'declined' ||
  (item.type === 'commandExecution' && typeof item.exitCode === 'number' && item.exitCode !== 0)

export interface RunCodexInput {
  bin: string
  prompt: string
  permission: string
  model?: string | undefined
  cwd?: string | undefined
  /** Thread Codex để làm tiếp. */
  resume?: string | undefined
  env: NodeJS.ProcessEnv
  signal: AbortSignal
  /** Hỏi người dùng một yêu cầu quyền (`ApprovalHub.request`). */
  ask(tool: string, input: unknown): Promise<boolean>
  /** Ghi nhật ký (yêu cầu chưa hỗ trợ…). */
  warn?: (msg: string) => void
  /** Nhật ký giao thức gọn: tên tin nhắn, không nội dung. */
  trace?: (line: string) => void
}

/** Chạy một lượt Codex tới khi xong, vấp hay bị dừng. */
export function runCodex(o: RunCodexInput, hooks: DriverHooks): Promise<DriverResult> {
  return new Promise((resolve) => {
    const child = spawn(o.bin, ['app-server'], { cwd: o.cwd, env: o.env, stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    let stopped = false
    let finished = false
    let threadId: string | undefined
    let final = ''
    let last = ''
    const open = new Set<string>()
    const files = new Map<string, { path: string }[]>()
    let next = 1
    const waiting = new Map<number, (r: { result?: unknown; error?: { message?: string } }) => void>()
    // Tiến trình đã tắt (bị dừng, quá giờ) mà vẫn còn trả lời dở: bỏ qua, không làm sập aris.
    child.stdin.on('error', () => undefined)
    const send = (m: Record<string, unknown>) => {
      if (child.stdin.writable && !finished) child.stdin.write(JSON.stringify(m) + '\n')
    }
    const call = (method: string, params: unknown) =>
      new Promise<{ result?: unknown; error?: { message?: string } }>((res) => {
        const id = next++
        waiting.set(id, res)
        send({ id, method, params })
      })
    const done = (r: Omit<DriverResult, 'sessionRef'>) => {
      if (finished) return
      finished = true
      for (const id of open) hooks.stepEnd(id, r.status === 'done' ? 'done' : 'failed')
      open.clear()
      child.kill('SIGTERM')
      resolve({ ...r, sessionRef: threadId })
    }
    const stepStart = (item: Item) => {
      for (const s of stepsOfItem(item, o.cwd)) {
        if (open.has(s.id)) continue
        open.add(s.id)
        hooks.step({ ...s, status: 'running', at: new Date().toISOString() })
      }
    }
    const stepEnd = (item: Item) => {
      stepStart(item)
      for (const s of stepsOfItem(item, o.cwd))
        if (open.delete(s.id)) hooks.stepEnd(s.id, itemFailed(item) ? 'failed' : 'done')
    }

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (d: string) => (stderr = (stderr + d).slice(-4000)))
    createInterface({ input: child.stdout }).on('line', (line) => {
      let m: {
        id?: number | string
        method?: string
        params?: Record<string, unknown>
        result?: unknown
        error?: { message?: string }
      }
      try {
        m = JSON.parse(line) as typeof m
      } catch {
        return
      }
      if (m.method && !/delta|tokenUsage|rateLimits|outputDelta/.test(m.method))
        o.trace?.(`${m.id !== undefined ? 'hỏi' : 'báo'} ${m.method}`)
      // Trả lời cho yêu cầu của aris.
      if (m.method === undefined && typeof m.id === 'number') {
        waiting.get(m.id)?.(m)
        waiting.delete(m.id)
        return
      }
      const p = m.params ?? {}
      // Codex hỏi aris (yêu cầu có id): duyệt quyền, hỏi người dùng… Không hỗ trợ thì từ chối.
      if (m.id !== undefined && m.method) {
        const reply = (result: unknown) => send({ id: m.id, result })
        const ask = (tool: string, input: unknown, ok: unknown, no: unknown) =>
          void o.ask(tool, input).then((allow) => reply(allow ? ok : no))
        if (m.method === 'item/commandExecution/requestApproval') {
          ask('Bash', { command: p.command ?? '' }, { decision: 'accept' }, { decision: 'decline' })
        } else if (m.method === 'item/fileChange/requestApproval') {
          const changed = files.get(String(p.itemId)) ?? []
          const target = changed.map((c) => c.path).join(', ') || String(p.grantRoot ?? '')
          ask('Edit', { file_path: target }, { decision: 'accept' }, { decision: 'decline' })
        } else if (m.method === 'item/permissions/requestApproval') {
          // Codex xin thêm quyền (ghi ngoài thư mục làm việc, mở mạng) cho lượt này.
          const perms = (p.permissions ?? {}) as {
            fileSystem?: { write?: string[] | null; read?: string[] | null } | null
            network?: { enabled?: boolean | null } | null
          }
          const paths = [...(perms.fileSystem?.write ?? []), ...(perms.fileSystem?.read ?? [])]
          ask(
            'Permissions',
            { path: paths.join(', ') || (perms.network?.enabled ? 'mạng' : String(p.reason ?? '')) },
            { permissions: perms, scope: 'turn' },
            { permissions: {}, scope: 'turn' },
          )
        } else if (m.method === 'execCommandApproval') {
          const cmd = Array.isArray(p.command) ? (p.command as string[]).join(' ') : String(p.command ?? '')
          ask(
            'Bash',
            { command: cmd },
            { decision: 'approved' },
            { decision: { denied: { rejection: 'Người dùng không cho phép.' } } },
          )
        } else if (m.method === 'applyPatchApproval') {
          const target = Object.keys((p.fileChanges ?? {}) as object).join(', ')
          ask(
            'Edit',
            { file_path: target },
            { decision: 'approved' },
            { decision: { denied: { rejection: 'Người dùng không cho phép.' } } },
          )
        } else {
          o.warn?.(`codex hỏi ${m.method}: aris chưa hỗ trợ, đã từ chối`)
          send({ id: m.id, error: { code: -32601, message: 'aris không hỗ trợ yêu cầu này' } })
        }
        return
      }
      if (m.method === 'item/started' || m.method === 'item/completed') {
        const item = p.item as Item
        if (item.type === 'fileChange' && item.changes) files.set(item.id, item.changes)
        if (m.method === 'item/started') stepStart(item)
        else {
          stepEnd(item)
          if (item.type === 'agentMessage' && item.text?.trim()) {
            last = item.text
            if (item.phase === 'final_answer' || item.phase === 'partial_answer') final = item.text
          }
        }
      } else if (m.method === 'turn/completed') {
        const turn = p.turn as { status: string; error?: { message?: string } | null }
        const output = (final || last).trim()
        if (turn.status === 'completed') done({ status: 'done', output })
        else if (turn.status === 'interrupted') done({ status: 'stopped', output })
        else done({ status: 'failed', output, diagnostic: clip(turn.error?.message ?? 'Codex báo lỗi', 200) })
      }
    })

    const stop = () => {
      stopped = true
      done({ status: 'stopped', output: (final || last).trim() })
    }
    if (o.signal.aborted) stop()
    else o.signal.addEventListener('abort', stop, { once: true })
    child.on('error', (e) =>
      done({ status: 'failed', output: '', diagnostic: `Không chạy được codex: ${e.message}` }),
    )
    child.on('close', (code) => {
      o.signal.removeEventListener('abort', stop)
      if (!stopped)
        done({
          status: 'failed',
          output: (final || last).trim(),
          diagnostic: `codex thoát (mã ${code ?? '?'}) trước khi xong${stderr.trim() ? `: ${clip(stderr.trim().split('\n').pop()!, 200)}` : ''}`,
        })
    })

    void (async () => {
      const init = await call('initialize', {
        clientInfo: { name: 'aris', title: 'aris', version: '0.0.1' },
        capabilities: null,
      })
      if (init.error)
        return done({ status: 'failed', output: '', diagnostic: `codex: ${init.error.message}` })
      send({ method: 'initialized' })
      const policy = codexPolicy(o.permission)
      const opened = o.resume
        ? await call('thread/resume', { threadId: o.resume, cwd: o.cwd ?? null, ...policy })
        : await call('thread/start', { cwd: o.cwd ?? null, model: o.model ?? null, ...policy })
      const thread = (opened.result as { thread?: { id?: string } } | undefined)?.thread
      if (opened.error || !thread?.id)
        return done({
          status: 'failed',
          output: '',
          diagnostic: `codex: ${opened.error?.message ?? 'không mở được thread'}`,
        })
      threadId = thread.id
      hooks.session(thread.id)
      const turn = await call('turn/start', {
        threadId: thread.id,
        input: [{ type: 'text', text: o.prompt, text_elements: [] }],
      })
      if (turn.error) done({ status: 'failed', output: '', diagnostic: `codex: ${turn.error.message}` })
    })()
  })
}
