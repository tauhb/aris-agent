// Chạy dsh của repo với DSH_HOME riêng (mặc định .dsh-home/ trong repo) để
// không đụng vào ~/.dsh của máy. Đặt ARIS_DSH_HOME để dùng thư mục khác.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { arisHome, dshBin } from './paths.mjs'

const home = arisHome()
mkdirSync(home, { recursive: true })
const child = spawn(process.execPath, [dshBin(), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, DSH_HOME: home },
})
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
