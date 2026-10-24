// Chạy dsh của repo với DSH_HOME riêng (mặc định .dsh-home/ trong repo) để
// không đụng vào ~/.dsh của máy. Đặt ARIS_DSH_HOME để dùng thư mục khác.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { arisHome, dshBin, socketPath } from './paths.mjs'

const home = arisHome()
mkdirSync(home, { recursive: true })
const args = process.argv.slice(2)

// Một chủ duy nhất: aris đang chạy ngầm (socket trả lời) thì không mở bản thứ hai cùng dữ liệu
// (hai nơi ghi phiên, hai nơi cùng nhận tin một bot Telegram). Bản do launchd chạy có ARIS_DAEMON.
const profile = args[args.indexOf('--profile') + 1]
const sock = socketPath(home)
if (profile === 'aris' && !process.env.ARIS_DAEMON && existsSync(sock)) {
  const alive = await new Promise((resolve) => {
    const s = connect(sock)
    s.once('connect', () => (s.destroy(), resolve(true)))
    s.once('error', () => resolve(false))
  })
  if (alive) {
    console.error('aris đang chạy ngầm với cùng thư mục dữ liệu. Mở web bằng: node scripts/aris.mjs open')
    console.error('Muốn chạy bản phát triển thì tắt bản chạy ngầm trước: node scripts/aris.mjs stop')
    process.exit(1)
  }
}

// Bộ cài plugin của dsh gọi `pnpm`; launchd chạy aris với PATH tối thiểu nên thêm các chỗ pnpm hay
// nằm (PNPM_HOME, thư mục pnpm mặc định của macOS/Linux, cạnh node đang chạy) nếu có.
function withTools(env, home = homedir()) {
  const extra = [
    env.PNPM_HOME,
    join(home, 'Library', 'pnpm'),
    join(home, '.local', 'share', 'pnpm'),
    dirname(process.execPath),
  ].filter((d) => d && existsSync(d))
  const path = (env.PATH ?? '').split(delimiter).filter(Boolean)
  return { ...env, PATH: [...path, ...extra.filter((d) => !path.includes(d))].join(delimiter) }
}

const child = spawn(process.execPath, [dshBin(), ...args], {
  stdio: 'inherit',
  env: { ...withTools(process.env), DSH_HOME: home },
})
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
