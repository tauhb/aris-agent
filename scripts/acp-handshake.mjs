// Thử nghiệm "nhiều mặt": đóng vai một IDE, khởi động profile aris-acp qua stdio,
// gửi `initialize` rồi `session/new` theo ACP v1 và in kết quả. Không cần khoá API
// vì chưa gửi prompt nào. Thoát mã 0 khi cả hai bước trả lời thành công.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { arisHome, dshBin, repoRoot } from './paths.mjs'

const patch = process.argv[2] ?? join(arisHome(), 'probe.patch.yml')
const probeOut = join(arisHome(), 'probe.out')
rmSync(probeOut, { force: true })
const args = [dshBin(), '--profile', 'aris-acp', ...(patch ? ['--patch', patch] : [])]
const child = spawn(process.execPath, args, {
  env: { ...process.env, DSH_HOME: arisHome() },
  stdio: ['pipe', 'pipe', 'pipe'],
})
let stderr = ''
child.stderr.on('data', (d) => (stderr += d))

const pending = new Map()
let nextId = 1
createInterface({ input: child.stdout }).on('line', (line) => {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const waiter = pending.get(msg.id)
  if (waiter) {
    pending.delete(msg.id)
    waiter(msg)
  }
})

function call(method, params) {
  const id = nextId++
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  return new Promise((resolve, reject) => {
    pending.set(id, resolve)
    setTimeout(() => reject(new Error(`${method}: hết thời gian chờ`)), 30000)
  })
}

let ok = false
try {
  const init = await call('initialize', { protocolVersion: 1, clientCapabilities: {} })
  console.log('initialize →', JSON.stringify(init.result ?? init.error))
  const session = await call('session/new', { cwd: repoRoot, mcpServers: [] })
  console.log('session/new →', JSON.stringify(session.result ?? session.error).slice(0, 400))
  ok = Boolean(init.result && session.result)
} catch (err) {
  console.error(String(err))
} finally {
  await new Promise((r) => setTimeout(r, 1500))
  child.stdin.end()
  setTimeout(() => child.kill(), 3000).unref()
}
child.on('exit', () => {
  if (existsSync(probeOut)) process.stdout.write(readFileSync(probeOut, 'utf8'))
  process.exit(ok ? 0 : 1)
})
