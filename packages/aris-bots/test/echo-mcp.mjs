#!/usr/bin/env node
// Máy chủ MCP nhỏ cho kiểm thử và chạy thử thật (stdio, JSON-RPC mỗi dòng một tin):
// `echo` (chỉ đọc) trả lại chữ; `ghi_chu` (ghi) giả vờ lưu ghi chú.
import process from 'node:process'
import { createInterface } from 'node:readline'

const tools = [
  {
    name: 'echo',
    description: 'Trả lại nguyên văn chữ gửi vào.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'ghi_chu',
    description: 'Lưu một ghi chú (thử nghiệm, không ghi gì thật).',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    annotations: { readOnlyHint: false },
  },
]
const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n')

createInterface({ input: process.stdin }).on('line', (line) => {
  let req
  try {
    req = JSON.parse(line)
  } catch {
    return
  }
  if (req.id === undefined) return
  const { method, params } = req
  if (method === 'initialize')
    return send({
      id: req.id,
      result: {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'echo-mcp', version: '1.0.0' },
      },
    })
  if (method === 'tools/list') return send({ id: req.id, result: { tools } })
  if (method === 'tools/call') {
    const text = String(params?.arguments?.text ?? '')
    const out =
      params?.name === 'ghi_chu' ? `Đã lưu ghi chú: ${text}` : `${process.env.ECHO_PREFIX ?? ''}${text}`
    return send({ id: req.id, result: { content: [{ type: 'text', text: out }] } })
  }
  if (method === 'ping') return send({ id: req.id, result: {} })
  send({ id: req.id, error: { code: -32601, message: `Không có ${method}` } })
})
