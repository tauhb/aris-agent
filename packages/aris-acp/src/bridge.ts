#!/usr/bin/env node
/**
 * `aris-acp --bot <tên>`: khách mỏng cho Buzz Desktop, IDE. Nối socket nội bộ của daemon aris, bắt tay một dòng,
 * rồi chuyển nguyên byte giữa stdio và socket. Không có model, không đọc khoá, không ghi đĩa; stdout chỉ chở
 * giao thức, lỗi in ra stderr.
 */
import { execFileSync } from 'node:child_process'
import { connect } from 'node:net'
import { basename } from 'node:path'
import { socketPath, type Hello } from './wire.js'

function argBot(argv: readonly string[]): string | undefined {
  const i = argv.findIndex((a) => a === '--bot' || a === '-b')
  if (i >= 0) return argv[i + 1]
  const eq = argv.find((a) => a.startsWith('--bot='))
  return eq?.slice('--bot='.length)
}

/** Tên tiến trình đã chạy lệnh này (để nhật ký ghi "từ Buzz Desktop"). */
function parentName(): string | undefined {
  try {
    const out = execFileSync('ps', ['-o', 'comm=', '-p', String(process.ppid)], { encoding: 'utf8' }).trim()
    return out ? basename(out) : undefined
  } catch {
    return undefined
  }
}

const fail = (msg: string): never => {
  process.stderr.write(`aris-acp: ${msg}\n`)
  process.exit(1)
}

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(
    'Dùng: aris-acp --bot <tên gọi của bot>\nNối ứng dụng hỗ trợ ACP (Buzz Desktop, Zed…) với một bot của aris.\n',
  )
  process.exit(0)
}
const bot = argBot(argv)
if (!bot) fail('thiếu --bot <tên gọi của bot>, ví dụ: aris-acp --bot lam')

const hello: Hello = { aris: 'acp', v: 1, bot: bot!, cwd: process.cwd(), parent: parentName() }
const sock = connect(socketPath())
sock.on('error', (e: NodeJS.ErrnoException) =>
  fail(
    e.code === 'ENOENT' || e.code === 'ECONNREFUSED'
      ? 'aris chưa chạy, hoặc chưa bật "Cho ứng dụng khác dùng aris" ở Cài đặt › Ứng dụng khác.'
      : String(e.message),
  ),
)
sock.on('connect', () => sock.write(`${JSON.stringify(hello)}\n`))

let head = ''
const onHead = (d: Buffer) => {
  head += d.toString('utf8')
  const i = head.indexOf('\n')
  if (i < 0) return
  sock.off('data', onHead)
  let reply: { ok?: boolean; error?: string }
  try {
    reply = JSON.parse(head.slice(0, i)) as { ok?: boolean; error?: string }
  } catch {
    return fail('daemon trả lời không hiểu được.')
  }
  if (!reply.ok) return fail(reply.error ?? 'daemon từ chối.')
  const rest = head.slice(i + 1)
  if (rest) process.stdout.write(rest)
  sock.pipe(process.stdout)
  process.stdin.pipe(sock)
  process.stdin.on('end', () => sock.end())
  sock.on('close', () => process.exit(0))
}
sock.on('data', onHead)
