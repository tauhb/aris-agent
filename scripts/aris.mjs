#!/usr/bin/env node
// Lệnh `aris`: chạy ngầm bằng launchd trên Mac và nói chuyện với aris đang chạy qua socket
// cục bộ ~/.aris/run/<băm>.sock (đặc tả: docs/specs/aris-daemon.md).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arisHome, repoRoot, socketPath } from './paths.mjs'

export const LABEL = 'vn.aris.daemon'
export const PORT = Number(process.env.ARIS_PORT ?? 3201)
const PLIST = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
const LOG_DIR = join(homedir(), 'Library', 'Logs', 'aris')
const LOG = join(LOG_DIR, 'daemon.log')

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Nội dung LaunchAgent: chạy dsh profile aris, chạy lại khi văng (cách nhau ít nhất 10 giây). */
export function plist({ node, script, home, port, logFile, path }) {
  const args = [node, script, '--profile', 'aris', 'web', '--no-open', '--port', String(port)]
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ARIS_DSH_HOME</key><string>${xml(home)}</string>
    <key>ARIS_DAEMON</key><string>1</string>
    <key>PATH</key><string>${xml(path)}</string>
  </dict>
  <key>WorkingDirectory</key><string>${xml(repoRoot)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${xml(logFile)}</string>
  <key>StandardErrorPath</key><string>${xml(logFile)}</string>
</dict>
</plist>
`
}

/** Tách lệnh, cờ (`--json`, `-f`) và phần chữ còn lại. */
export function parseArgs(argv) {
  const [cmd = 'help', ...rest] = argv
  const flags = new Set(rest.filter((a) => /^--?[a-z]/.test(a)))
  const text = rest.filter((a) => !/^--?[a-z]/.test(a)).join(' ')
  return { cmd, flags, text }
}

/** Gọi socket; trả null khi không có daemon. */
export function callSocket(method, path, body, sock = socketPath()) {
  return new Promise((resolve, reject) => {
    if (!existsSync(sock)) return resolve(null)
    const req = request(
      { socketPath: sock, method, path, headers: { 'content-type': 'application/json' } },
      (res) => {
        const chunks = []
        res.on('data', (b) => chunks.push(b))
        res.on('end', () => {
          const parsed = JSON.parse(Buffer.concat(chunks).toString() || '{}')
          if ((res.statusCode ?? 500) >= 400) reject(new Error(parsed.error ?? `HTTP ${res.statusCode}`))
          else resolve(parsed)
        })
      },
    )
    req.on('error', (e) => (e.code === 'ECONNREFUSED' || e.code === 'ENOENT' ? resolve(null) : reject(e)))
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}

const portBusy = (port) =>
  new Promise((resolve) => {
    const s = connect({ host: '127.0.0.1', port })
    s.once('connect', () => (s.destroy(), resolve(true)))
    s.once('error', () => resolve(false))
  })

const uid = () => process.getuid()
/** Lệnh cần aris đang chạy: báo và thoát mã 1 (script cron biết là hỏng). */
function notRunning() {
  console.error('aris không chạy. Bật bằng: aris start (chưa cài chạy ngầm thì: aris install)')
  process.exitCode = 1
}

const launchctl = (...args) => spawnSync('launchctl', args, { encoding: 'utf8' })
const loaded = () => launchctl('print', `gui/${uid()}/${LABEL}`).status === 0

function mac() {
  if (process.platform !== 'darwin') {
    console.error('aris: chạy ngầm bằng launchd chỉ có trên macOS.')
    process.exit(1)
  }
}

const HELP = `aris — điều khiển aris chạy ngầm

  aris install          cài LaunchAgent: aris tự chạy khi đăng nhập, văng thì chạy lại
  aris uninstall        gỡ LaunchAgent (giữ nguyên dữ liệu)
  aris start | stop | restart
  aris status           trạng thái, web, bot Telegram
  aris logs [-f]        xem log (theo dõi với -f)
  aris open | url       mở web đã đăng nhập / in đường đăng nhập
  aris send "…"         gửi Telegram tới nơi nhận (/sethome)
  aris ask "…" [--json] giao một việc cho Aris và in câu trả lời cuối`

async function main(argv) {
  const { cmd, flags, text } = parseArgs(argv)
  switch (cmd) {
    case 'install': {
      mac()
      if (!(await callSocket('GET', '/status')) && (await portBusy(PORT))) {
        console.error(
          `aris: cổng ${PORT} đang có tiến trình khác giữ (máy chủ phát triển?). Tắt nó trước rồi cài.`,
        )
        process.exit(1)
      }
      mkdirSync(LOG_DIR, { recursive: true })
      mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true })
      writeFileSync(
        PLIST,
        plist({
          node: process.execPath,
          script: join(repoRoot, 'scripts', 'dsh.mjs'),
          home: arisHome(),
          port: PORT,
          logFile: LOG,
          path: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        }),
      )
      if (loaded()) launchctl('bootout', `gui/${uid()}/${LABEL}`)
      const r = launchctl('bootstrap', `gui/${uid()}`, PLIST)
      if (r.status !== 0) {
        console.error(`aris: launchctl bootstrap lỗi: ${r.stderr.trim()}`)
        process.exit(1)
      }
      console.log(`Đã cài ${LABEL}. aris đang khởi động; xem: aris status, aris logs -f`)
      return
    }
    case 'uninstall':
      mac()
      if (loaded()) launchctl('bootout', `gui/${uid()}/${LABEL}`)
      rmSync(PLIST, { force: true })
      console.log('Đã gỡ LaunchAgent. Dữ liệu (phiên, ký ức, kênh) vẫn giữ nguyên.')
      return
    case 'start': {
      mac()
      if (!existsSync(PLIST)) return console.error('aris: chưa cài. Chạy: aris install')
      if (loaded()) return console.log('aris đang chạy.')
      const r = launchctl('bootstrap', `gui/${uid()}`, PLIST)
      return console.log(r.status === 0 ? 'Đã bật aris.' : `Lỗi: ${r.stderr.trim()}`)
    }
    case 'stop':
      if (process.platform === 'darwin' && loaded()) {
        launchctl('bootout', `gui/${uid()}/${LABEL}`)
        return console.log('Đã tắt aris (launchd không chạy lại cho tới khi aris start).')
      }
      return console.log((await callSocket('POST', '/stop')) ? 'Đã yêu cầu aris dừng.' : 'aris không chạy.')
    case 'restart':
      mac()
      if (!loaded()) return console.error('aris chưa được launchd giữ. Chạy: aris start')
      launchctl('kickstart', '-k', `gui/${uid()}/${LABEL}`)
      return console.log('Đã khởi động lại aris.')
    case 'status': {
      const s = await callSocket('GET', '/status')
      const managed = process.platform === 'darwin' && loaded()
      if (!s) {
        console.log(`aris không chạy${managed ? ' (launchd đang cố khởi động, xem aris logs)' : ''}.`)
        process.exitCode = 1
        return
      }
      const up = `${Math.floor(s.uptimeSec / 3600)} giờ ${Math.floor((s.uptimeSec % 3600) / 60)} phút`
      console.log(`aris đang chạy · pid ${s.pid} · ${up}${managed ? ' · launchd giữ' : ' · chạy tay'}`)
      if (s.web) console.log(`Web: ${s.web} (đăng nhập: aris open)`)
      for (const b of s.telegram ?? [])
        console.log(
          `Telegram: @${b.username} ${b.running ? 'đang nhận tin' : `dừng${b.error ? ` — ${b.error}` : ''}`}`,
        )
      return
    }
    case 'logs': {
      if (!existsSync(LOG)) return console.log('Chưa có log (aris chưa chạy bằng launchd).')
      const tail = spawn('tail', flags.has('-f') ? ['-n', '100', '-f', LOG] : ['-n', '100', LOG], {
        stdio: 'inherit',
      })
      return new Promise((r) => tail.on('exit', r))
    }
    case 'url':
    case 'open': {
      const r = await callSocket('POST', '/login')
      if (!r) return notRunning()
      if (cmd === 'url') return console.log(r.url)
      spawn('open', [r.url], { stdio: 'ignore', detached: true }).unref()
      return console.log('Đã mở aris trong trình duyệt.')
    }
    case 'send': {
      if (!text) return console.error('Dùng: aris send "nội dung"')
      const r = await callSocket('POST', '/send', { text })
      if (!r) return notRunning()
      return console.log(r.result)
    }
    case 'ask': {
      if (!text) return console.error('Dùng: aris ask "việc cần làm" [--json]')
      const json = flags.has('--json')
      const r = await callSocket('POST', '/ask', { text })
      // Không có đường chạy một lần bằng headless: bản đó của dsh tắt kho khoá, không có kênh.
      if (!r) return notRunning()
      console.log(json ? JSON.stringify(r) : r.text)
      process.exitCode = r.reason === 'completed' ? 0 : 1
      return
    }
    default:
      console.log(HELP)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main(process.argv.slice(2)).catch((e) => {
    console.error(`aris: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  })
