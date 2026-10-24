#!/usr/bin/env node
// Máy chủ MCP tối thiểu cho `claude --permission-prompt-tool mcp__aris__approve`: mỗi yêu cầu quyền
// chuyển qua socket cục bộ của aris (ARIS_APPROVE_SOCK) để người dùng duyệt trên nhánh, rồi trả quyết
// định cho Claude Code. Không phụ thuộc gói nào; socket hỏng thì từ chối.
import { connect } from 'node:net'
import process from 'node:process'
import { createInterface } from 'node:readline'

const sock = process.env.ARIS_APPROVE_SOCK
const run = process.env.ARIS_APPROVE_RUN
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n')

/** Hỏi aris một yêu cầu quyền; trả `{ behavior, ... }` đúng định dạng Claude Code đợi. */
function ask(args) {
  return new Promise((resolve) => {
    const deny = (message) => resolve({ behavior: 'deny', message })
    if (!sock || !run) return deny('aris không nhận được yêu cầu quyền.')
    const c = connect(sock)
    let buf = ''
    c.setEncoding('utf8')
    c.on('connect', () => c.write(JSON.stringify({ run, ...args }) + '\n'))
    c.on('data', (d) => {
      buf += d
      const i = buf.indexOf('\n')
      if (i < 0) return
      c.end()
      try {
        const r = JSON.parse(buf.slice(0, i))
        resolve(
          r.allow
            ? { behavior: 'allow', updatedInput: args.input ?? {} }
            : { behavior: 'deny', message: r.message || 'Người dùng không cho phép.' },
        )
      } catch {
        deny('aris trả lời không hợp lệ.')
      }
    })
    c.on('error', () => deny('Không hỏi được người dùng (aris không phản hồi).'))
  })
}

createInterface({ input: process.stdin }).on('line', async (line) => {
  let m
  try {
    m = JSON.parse(line)
  } catch {
    return
  }
  if (m.method === 'initialize')
    send({
      jsonrpc: '2.0',
      id: m.id,
      result: {
        protocolVersion: m.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'aris', version: '0.0.1' },
      },
    })
  else if (m.method === 'tools/list')
    send({
      jsonrpc: '2.0',
      id: m.id,
      result: {
        tools: [
          {
            name: 'approve',
            description: 'Hỏi người dùng aris có cho phép thao tác này không.',
            inputSchema: {
              type: 'object',
              properties: {
                tool_name: { type: 'string' },
                input: { type: 'object' },
                tool_use_id: { type: 'string' },
              },
              required: ['tool_name', 'input'],
            },
          },
        ],
      },
    })
  else if (m.method === 'tools/call') {
    const decision = await ask(m.params?.arguments ?? {})
    send({
      jsonrpc: '2.0',
      id: m.id,
      result: { content: [{ type: 'text', text: JSON.stringify(decision) }] },
    })
  } else if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, result: {} })
})
