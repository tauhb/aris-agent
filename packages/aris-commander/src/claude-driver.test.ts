import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ApprovalHub, type ApprovalRequest } from './approval.js'
import { ClaudeStream, childEnv, claudeArgs, stepOf, type Step } from './claude-driver.js'

/** Luồng sự kiện thật của `claude -p --output-format stream-json` (rút gọn, bỏ đường dẫn máy). */
export const CLAUDE_STREAM = [
  '{"type": "system", "subtype": "init", "cwd": "/w", "session_id": "1e9ed889-42e4-4557-8382-01e1021c066e"}',
  '{"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "toolu_015muotzLqwwjrz6Hh1fPxbz", "name": "Write", "input": {"file_path": "/w/b.txt", "content": "aris"}, "caller": {"type": "direct"}}]}, "session_id": "1e9ed889-42e4-4557-8382-01e1021c066e"}',
  '{"type": "user", "message": {"content": [{"tool_use_id": "toolu_015muotzLqwwjrz6Hh1fPxbz", "type": "tool_result", "content": "File created successfully at: /w/b.txt (file state is current in your context — no need to Read it back)"}]}, "session_id": "1e9ed889-42e4-4557-8382-01e1021c066e"}',
  '{"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "toolu_01UXQuQ9LKa9oeBQV22RHV9W", "name": "Bash", "input": {"command": "cat b.txt", "description": "Hiển thị nội dung file b.txt"}, "caller": {"type": "direct"}}]}, "session_id": "1e9ed889-42e4-4557-8382-01e1021c066e"}',
  '{"type": "user", "message": {"content": [{"tool_use_id": "toolu_01UXQuQ9LKa9oeBQV22RHV9W", "type": "tool_result", "content": "aris", "is_error": false}]}, "session_id": "1e9ed889-42e4-4557-8382-01e1021c066e"}',
  '{"type": "assistant", "message": {"content": [{"type": "text", "text": "Đã tạo b.txt và `cat b.txt` in ra: `aris`."}]}, "session_id": "1e9ed889-42e4-4557-8382-01e1021c066e"}',
  '{"session_id": "1e9ed889-42e4-4557-8382-01e1021c066e", "total_cost_usd": 0.247593, "is_error": false, "subtype": "success", "result": "Đã tạo b.txt và `cat b.txt` in ra: `aris`.", "type": "result"}',
]

function collect() {
  const steps: Step[] = []
  const ends: string[] = []
  const meta: string[] = []
  const hooks = {
    step: (s: Step) => void steps.push(s),
    stepEnd: (id: string, st: Step['status']) => void ends.push(`${id}:${st}`),
    cost: (usd: number) => void meta.push(`cost ${usd}`),
    session: (ref: string) => void meta.push(`session ${ref}`),
  }
  return { steps, ends, meta, hooks }
}

describe('đọc luồng sự kiện của Claude Code', () => {
  it('mỗi lần gọi công cụ thành một bước, xong khi có kết quả; giữ phiên, chi phí, câu trả lời cuối', () => {
    const c = collect()
    const s = new ClaudeStream(c.hooks, '/w', () => new Date('2026-10-24T03:00:00Z'))
    for (const l of CLAUDE_STREAM) s.line(l)
    expect(c.steps.map((x) => [x.kind, x.target])).toEqual([
      ['write', 'b.txt'],
      ['run', 'cat b.txt'],
    ])
    expect(c.ends).toEqual(['toolu_015muotzLqwwjrz6Hh1fPxbz:done', 'toolu_01UXQuQ9LKa9oeBQV22RHV9W:done'])
    expect(c.meta[0]).toBe('session 1e9ed889-42e4-4557-8382-01e1021c066e')
    const r = s.finish(0, false, '')
    expect(r.status).toBe('done')
    expect(r.output).toContain('aris')
    expect(r.costUsd).toBeGreaterThan(0)
    expect(r.sessionRef).toBe('1e9ed889-42e4-4557-8382-01e1021c066e')
  })

  it('chạm trần tiền, thoát không có kết quả, bị dừng: báo đúng lý do', () => {
    const budget = new ClaudeStream(collect().hooks)
    budget.line(
      JSON.stringify({
        type: 'result',
        subtype: 'error_max_budget_usd',
        is_error: true,
        total_cost_usd: 3.2,
      }),
    )
    expect(budget.finish(1, false, '', 3)).toMatchObject({
      status: 'failed',
      diagnostic: 'Chạm trần tiền 3 USD',
      costUsd: 3.2,
    })
    expect(new ClaudeStream(collect().hooks).finish(1, false, 'lỗi\nNot logged in').diagnostic).toBe(
      'claude thoát (mã 1) không có kết quả: Not logged in',
    )
    const c = collect()
    const stopped = new ClaudeStream(c.hooks)
    stopped.line(CLAUDE_STREAM[1]!)
    expect(stopped.finish(null, true, '').status).toBe('stopped')
    expect(c.ends).toEqual(['toolu_015muotzLqwwjrz6Hh1fPxbz:failed'])
  })

  it('bước có nghĩa theo công cụ; đường dẫn tương đối với thư mục làm việc', () => {
    expect(stepOf('Edit', { file_path: '/repo/src/a.ts' }, '/repo')).toEqual({
      kind: 'edit',
      target: 'src/a.ts',
    })
    expect(stepOf('Read', { file_path: '/etc/hosts' }, '/repo')).toEqual({
      kind: 'read',
      target: '/etc/hosts',
    })
    expect(stepOf('Bash', { command: 'npm test\nnpm run lint' })).toEqual({ kind: 'run', target: 'npm test' })
    expect(stepOf('mcp__x__y', {})).toEqual({ kind: 'other', tool: 'mcp__x__y' })
  })

  it('tham số dòng lệnh: hỏi quyền qua MCP của aris, trần tiền, làm tiếp phiên', () => {
    const args = claudeArgs({
      prompt: 'việc',
      permission: 'manual',
      mcpConfig: '{}',
      budgetUsd: 3,
      resume: 's-1',
    })
    expect(args).toEqual([
      '-p',
      'việc',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'manual',
      '--permission-prompt-tool',
      'mcp__aris__approve',
      '--mcp-config',
      '{}',
      '--max-budget-usd',
      '3',
      '--resume',
      's-1',
    ])
    expect(claudeArgs({ prompt: 'x', permission: 'bypassPermissions', mcpConfig: '{}' })).not.toContain(
      '--mcp-config',
    )
  })

  it('môi trường cho agent: bỏ khoá, token và biến của dsh', () => {
    expect(
      childEnv(
        { PATH: '/bin', HOME: '/u', DEEPSEEK_API_KEY: 'x', GH_TOKEN: 'y', DSH_HOME: '/d' },
        { ARIS_APPROVE_RUN: 'r' },
      ),
    ).toEqual({ PATH: '/bin', HOME: '/u', ARIS_APPROVE_RUN: 'r' })
  })
})

describe('duyệt quyền qua máy chủ MCP của aris', () => {
  it('Claude Code hỏi qua MCP, người dùng cho phép hoặc từ chối, hết hạn thì từ chối', async () => {
    const opened: ApprovalRequest[] = []
    const closed: string[] = []
    const dir = mkdtempSync(join(tmpdir(), 'ap-'))
    const hub = new ApprovalHub(
      {
        opened: (r) => void opened.push(r),
        closed: (r, allow, by) => void closed.push(`${r.tool}:${allow}:${by}`),
      },
      join(dir, 's.sock'),
      300,
    )
    await hub.start()
    const script = fileURLToPath(new URL('../bin/approve-mcp.mjs', import.meta.url))
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ARIS_APPROVE_SOCK: hub.path, ARIS_APPROVE_RUN: 'run-1' },
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    const replies = new Map<number, unknown>()
    let buf = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d: string) => {
      buf += d
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const m = JSON.parse(buf.slice(0, i)) as { id: number }
        buf = buf.slice(i + 1)
        replies.set(m.id, m)
      }
    })
    const call = async (id: number, method: string, params: unknown) => {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      for (let n = 0; n < 200 && !replies.has(id); n++) await new Promise((r) => setTimeout(r, 10))
      return replies.get(id) as { result: { content?: { text: string }[]; tools?: { name: string }[] } }
    }
    expect((await call(1, 'tools/list', {})).result.tools?.[0]?.name).toBe('approve')
    const ask = (id: number, tool: string) =>
      call(id, 'tools/call', {
        name: 'approve',
        arguments: { tool_name: tool, input: { command: 'npm test' } },
      })
    const write = ask(2, 'Bash')
    for (let n = 0; n < 200 && !opened.length; n++) await new Promise((r) => setTimeout(r, 10))
    expect(hub.of('run-1')).toHaveLength(1)
    hub.answer(opened[0]!.id, true)
    expect(JSON.parse((await write).result.content![0]!.text)).toEqual({
      behavior: 'allow',
      updatedInput: { command: 'npm test' },
    })
    const late = await ask(3, 'Write')
    expect(JSON.parse(late.result.content![0]!.text).behavior).toBe('deny')
    expect(closed).toEqual(['Bash:true:user', 'Write:false:timeout'])
    child.kill()
    hub.stop()
  })
})
