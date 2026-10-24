import { chmodSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Step } from './claude-driver.js'
import { codexPolicy, runCodex, stepsOfItem } from './codex-driver.js'

/** `codex app-server` giả: một lượt có lệnh cần duyệt, một tệp sửa, câu trả lời cuối. */
const FAKE = `#!/usr/bin/env node
const rl = require('node:readline').createInterface({ input: process.stdin })
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n')
rl.on('line', (line) => {
  const m = JSON.parse(line)
  if (m.method === 'initialize') send({ id: m.id, result: { userAgent: 'fake' } })
  else if (m.method === 'thread/start' || m.method === 'thread/resume')
    send({ id: m.id, result: { thread: { id: m.params.threadId ?? 'th-1' }, echo: m.params } })
  else if (m.method === 'turn/start') {
    send({ id: m.id, result: { turn: { id: 'tu-1', status: 'inProgress' } } })
    send({ method: 'item/started', params: { item: { type: 'commandExecution', id: 'c1', command: 'npm test' } } })
    send({ id: 900, method: 'item/commandExecution/requestApproval', params: { itemId: 'c1', command: 'npm test' } })
  } else if (m.id === 900) {
    const ok = m.result.decision === 'accept'
    send({ method: 'item/completed', params: { item: { type: 'commandExecution', id: 'c1', command: 'npm test', exitCode: ok ? 0 : null, status: ok ? 'completed' : 'declined' } } })
    send({ method: 'item/completed', params: { item: { type: 'fileChange', id: 'f1', changes: [{ path: process.cwd() + '/src/a.ts' }], status: 'completed' } } })
    send({ method: 'item/completed', params: { item: { type: 'agentMessage', id: 'm1', text: 'Đã sửa xong.', phase: 'final_answer' } } })
    send({ method: 'turn/completed', params: { turn: { status: 'completed', error: null } } })
  }
})
`

function fake() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'codex-')))
  const bin = join(dir, 'codex')
  writeFileSync(bin, FAKE)
  chmodSync(bin, 0o755)
  return { bin, dir }
}

describe('bộ chuyển Codex', () => {
  it('mức quyền thành chính sách duyệt và sandbox', () => {
    expect(codexPolicy('ask')).toEqual({ approvalPolicy: 'untrusted', sandbox: 'workspace-write' })
    expect(codexPolicy('never')).toEqual({ approvalPolicy: 'never' })
    expect(codexPolicy('dangerously-bypass-approvals-and-sandbox').sandbox).toBe('danger-full-access')
  })

  it('mục của Codex thành bước: lệnh, mỗi tệp đổi một bước', () => {
    expect(
      stepsOfItem({ type: 'fileChange', id: 'f', changes: [{ path: '/r/a.ts' }, { path: '/r/b.ts' }] }, '/r'),
    ).toEqual([
      { id: 'f#0', kind: 'edit', target: 'a.ts' },
      { id: 'f#1', kind: 'edit', target: 'b.ts' },
    ])
    expect(stepsOfItem({ type: 'reasoning', id: 'x' })).toEqual([])
  })

  it('chạy một lượt: hỏi người dùng khi Codex xin chạy lệnh, ghi từng bước, lấy câu trả lời cuối', async () => {
    const { bin, dir } = fake()
    for (const allow of [true, false]) {
      const steps: Step[] = []
      const ends: string[] = []
      const asked: unknown[] = []
      let session = ''
      const r = await runCodex(
        {
          bin,
          cwd: dir,
          env: process.env,
          signal: new AbortController().signal,
          prompt: 'Sửa lỗi',
          permission: 'ask',
          ask: async (tool, input) => (asked.push([tool, input]), allow),
        },
        {
          step: (s) => void steps.push(s),
          stepEnd: (id, st) => void ends.push(`${id}:${st}`),
          cost: () => undefined,
          session: (ref) => void (session = ref),
        },
      )
      expect(asked).toEqual([['Bash', { command: 'npm test' }]])
      expect(steps.map((s) => [s.kind, s.target])).toEqual([
        ['run', 'npm test'],
        ['edit', 'src/a.ts'],
      ])
      expect(ends).toEqual([`c1:${allow ? 'done' : 'failed'}`, 'f1#0:done'])
      expect(r).toMatchObject({ status: 'done', output: 'Đã sửa xong.', sessionRef: 'th-1' })
      expect(session).toBe('th-1')
    }
  })
})
