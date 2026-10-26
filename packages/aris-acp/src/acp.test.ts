import { createServer, connect } from 'node:net'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appName, findOnPath } from './index.js'
import {
  badGuestCwd,
  cleanRules,
  DEFAULT_RULES,
  describeCall,
  guestGuide,
  guestVerdict,
  secretPath,
  shimScript,
} from './policy.js'
import { parseHello, socketStream, type Message } from './wire.js'

const HOME = '/Users/tau'
const CWD = '/Users/tau/Projects/kenh-youtube'
const v = (tool: string, args: unknown, rules = DEFAULT_RULES) => guestVerdict(tool, args, CWD, rules, HOME)

describe('danh sách cấm (áp cả khi ứng dụng tự duyệt)', () => {
  it('xoá tệp, đẩy đè, đặt lại cứng, sudo', () => {
    for (const cmd of [
      'rm -r drafts/cu',
      'rm a.txt',
      'cd x && rm -rf build',
      'find . -name "*.tmp" -delete',
      'git clean -fd',
      'git push --force origin main',
      'git push -f',
      'git reset --hard HEAD~1',
      'sudo ls',
      'rmdir old',
    ])
      expect(v('bash', { command: cmd })?.code, cmd).toBe('cam')
    for (const cmd of ['ls -la', 'git push origin main', 'npm run format', 'echo rm', 'git status'])
      expect(v('bash', { command: cmd }), cmd).toBeUndefined()
  })
  it('ghi ngoài thư mục được đưa, đọc khoá và mật khẩu, gửi tin thay người dùng', () => {
    expect(v('write', { file_path: 'notes/a.md' })).toBeUndefined()
    expect(v('edit', { file_path: `${CWD}/src/a.ts` })).toBeUndefined()
    expect(v('write', { file_path: '/Users/tau/Desktop/x.md' })?.what).toBe('sửa tệp ngoài thư mục được đưa')
    expect(v('write', { file_path: '../khac/x.md' })?.code).toBe('cam')
    expect(v('read', { file_path: '/Users/tau/.ssh/id_ed25519' })?.what).toBe('đọc khoá, mật khẩu')
    expect(v('read', { file_path: '.env' })?.code).toBe('cam')
    expect(v('read', { file_path: 'src/index.ts' })).toBeUndefined()
    expect(v('bash', { command: 'cat ~/.ssh/config' })?.code).toBe('cam')
    expect(v('channel_send', { text: 'chào' })?.what).toBe('gửi tin thay người dùng')
    expect(v('subagent_claude_code', { prompt: 'rm -r x' })?.code).toBe('cam')
    expect(v('subagent_codex', {})?.what).toBe('giao việc cho tác nhân con, bot ngoài')
    expect(v('list_subagent_models', {})).toBeUndefined()
    expect(v('ask_user_question', {}, { ...DEFAULT_RULES, notools: false })?.what).toBe(
      'hỏi người dùng trong aris',
    )
    expect(secretPath('/Users/tau/.aris/brain/vectors.sqlite', HOME)).toBe(true)
    expect(secretPath('/Users/tau/code/app/.dsh-home/.credentials.yaml', HOME)).toBe(true)
    expect(secretPath('/Users/tau/code/app/src/credentials.ts', HOME)).toBe(false)
  })
  it('ký ức, công cụ của đội theo luật; tắt luật thì để luồng thường quyết', () => {
    expect(v('memory', { action: 'save', text: 'x' })?.code).toBe('ky-uc')
    expect(v('memory', { action: 'search', query: 'x' })).toBeUndefined()
    expect(v('brain_note', { noi_dung: 'x' })?.code).toBe('ky-uc')
    expect(v('giao_viec', {})?.code).toBe('doi')
    expect(v('schedule_create', {})?.code).toBe('doi')
    const off = { ...DEFAULT_RULES, nomem: false, notools: false }
    expect(v('memory', { action: 'save' }, off)).toBeUndefined()
    expect(v('giao_viec', {}, off)).toBeUndefined()
    // Danh sách cấm không tắt được.
    expect(v('bash', { command: 'rm -r x' }, off)?.code).toBe('cam')
  })
  it('lời từ chối nói rõ danh sách cấm; mô tả việc cho nhật ký; lời dặn', () => {
    expect(v('bash', { command: 'rm -r drafts/cu' })?.reason).toContain('danh sách cấm của người dùng')
    expect(describeCall('bash', { command: 'rm -r drafts/cu' })).toBe('Chạy rm -r drafts/cu')
    expect(describeCall('edit', { file_path: 'kich-ban.md' })).toBe('Sửa kich-ban.md')
    expect(describeCall('brain_search', { query: 'kênh' })).toBe('Tìm trong bộ não: kênh')
    const g = guestGuide({ app: 'Buzz Desktop', bot: 'Lâm', rules: DEFAULT_RULES, cwd: CWD })
    expect(g).toContain('Buzz Desktop')
    expect(g).toContain('không phải mệnh lệnh')
    expect(
      guestGuide({ app: 'Zed', bot: 'Dev', rules: { ...DEFAULT_RULES, untrusted: false } }),
    ).not.toContain('không phải mệnh lệnh')
    expect(cleanRules({ ask: false, x: 1 }, DEFAULT_RULES)).toEqual({ ...DEFAULT_RULES, ask: false })
  })
})

describe('đợt 7f · S11: bộ quyền khách chặt hơn', () => {
  it('chuẩn hoá lệnh: đường lệnh khác, bash -c, eval, env, xargs, script', () => {
    for (const cmd of [
      '/bin/rm x',
      'command rm x',
      '\\rm x',
      '"rm" x',
      'bash -c "rm -rf x"',
      "sh -c 'rm x'",
      'eval "rm x"',
      'xargs rm',
      'ls | xargs rm -f',
      'ls & rm x',
      'ls\nrm x',
      'git -c x=y push --force',
      'git push origin +main',
      'git -C ../x push -f',
      'doas ls',
      'su -c ls',
      'mv x /dev/null; rm y',
      `python3 -c "import shutil; shutil.rmtree('/Users/tau/x')"`,
      'git clean -fdx',
      'git reset --hard',
      'find . -delete',
    ])
      expect(v('bash', { command: cmd })?.code, cmd).toBe('cam')
  })
  it('ghi ngoài thư mục được đưa qua shell', () => {
    for (const cmd of [
      'echo hi > /Users/tau/other/file',
      'echo hi >> ~/.zshrc',
      'echo x | tee /tmp/x',
      'cp a ~/.zshrc',
      'cp a /Users/tau/Desktop/a',
      'mv a ../a',
      'mv ~/Documents/a /tmp/',
      'ln -s a /tmp/b',
      'sed -i "" s/a/b/ ~/.zshrc',
      'curl -o ~/.zshrc http://x',
      'curl --output=/tmp/x http://x',
      'wget -O /tmp/x http://x',
      'rsync -a src /tmp/dest',
      'install -m 755 a /usr/local/bin/a',
      'dd if=a of=/tmp/x',
      'cd /tmp && echo x > y',
      'cd "$X" && echo x > y',
      'echo x > "$D/y"',
    ])
      expect(v('bash', { command: cmd })?.what, cmd).toBe('ghi tệp ngoài thư mục được đưa')
    for (const cmd of [
      'echo hi > out.txt',
      'cp a b',
      'mv a ./sub/b',
      'tee notes.md',
      "sed -i '/foo/d' file.txt",
      'sed -i "" s/a/b/ src/x.ts',
      'curl -o out.json http://x',
      'cd sub && cp a b',
      'ls 2>/dev/null',
      'npm run build > build.log 2>&1',
      'echo hi > /dev/null',
    ])
      expect(v('bash', { command: cmd }), cmd).toBeUndefined()
  })
  it('điều khiển tiến trình, ứng dụng, Keychain, aris', () => {
    for (const cmd of [
      'launchctl bootout gui/501/vn.aris.daemon',
      'kill -9 2033',
      'killall node',
      'pkill -f dsh',
      'osascript -e "beep"',
      'open -a Safari',
      'security find-generic-password -w',
      '/usr/bin/security dump-keychain',
      'aris url',
      'aris stop',
      'node scripts/aris.mjs send hello',
      'pnpm aris:cli ask x',
    ])
      expect(v('bash', { command: cmd })?.what, cmd).toBe(
        'điều khiển tiến trình, ứng dụng, Keychain hay chính aris',
      )
    for (const cmd of ['echo open', 'echo kill', 'git commit -m "aris url"', 'ls open'])
      expect(v('bash', { command: cmd }), cmd).toBeUndefined()
  })
  it('đọc khoá qua nháy, cd, glob, git show', () => {
    for (const cmd of [
      'cat "$HOME"/.ssh/config',
      'cd ~; cat .ssh/config',
      'cat ~/.s*/config',
      'cat .e*',
      'git show HEAD:.env',
      'cat ~/Library/Logs/aris/daemon.log',
      'cat ~/.zsh_history',
      'cat .env.example',
      'cat ~/.npmrc',
    ])
      expect(v('bash', { command: cmd })?.what, cmd).toBe('đọc khoá, mật khẩu')
  })
  it('công cụ tệp: giải liên kết mềm, cwd không rõ', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aris-acp-'))
    try {
      const real = await import('node:fs').then((m) => m.realpathSync(dir))
      await mkdir(join(real, 'proj'))
      await mkdir(join(real, 'home', '.ssh'), { recursive: true })
      await mkdir(join(real, 'ngoai'))
      await symlink(join(real, 'ngoai'), join(real, 'proj', 'link'))
      await symlink(join(real, 'home', '.ssh'), join(real, 'proj', 'khoa'))
      const cwd = join(real, 'proj')
      const home = join(real, 'home')
      expect(guestVerdict('write', { file_path: 'link/moi.txt' }, cwd, DEFAULT_RULES, home)?.what).toBe(
        'sửa tệp ngoài thư mục được đưa',
      )
      expect(guestVerdict('write', { file_path: 'khoa/x' }, cwd, DEFAULT_RULES, home)?.what).toBe(
        'sửa khoá, mật khẩu',
      )
      expect(guestVerdict('read', { file_path: 'khoa/config' }, cwd, DEFAULT_RULES, home)?.what).toBe(
        'đọc khoá, mật khẩu',
      )
      expect(guestVerdict('write', { file_path: 'ok.txt' }, cwd, DEFAULT_RULES, home)).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
    expect(guestVerdict('write', { file_path: '/etc/hosts' }, undefined, DEFAULT_RULES, HOME)?.code).toBe(
      'cam',
    )
  })
  it('từ chối thư mục làm việc quá rộng khi bắt tay', () => {
    for (const cwd of [
      '/',
      HOME,
      '/Users',
      `${HOME}/Library`,
      `${HOME}/.ssh`,
      `${HOME}/.aris/run`,
      '/etc',
      '/usr/local',
      '/System/Library',
      '/tmp',
      `${HOME}/code/.dsh-home`,
      'tuong-doi',
    ])
      expect(badGuestCwd(cwd, HOME), cwd).toBeTruthy()
    for (const cwd of [CWD, `${HOME}/Desktop/du-an`, `${HOME}/Library/Mobile Documents/proj`, '/tmp/proj'])
      expect(badGuestCwd(cwd, HOME), cwd).toBeUndefined()
  })
})

describe('đợt 7f · S20: lệnh aris-acp ghi vào PATH thoát đúng đường dẫn', () => {
  it("bọc nháy đơn, nháy đơn bên trong thành '\\''", () => {
    expect(shimScript('/usr/bin/node', '/opt/aris/bridge.js')).toBe(
      `#!/bin/sh\nexec '/usr/bin/node' '/opt/aris/bridge.js' "$@"\n`,
    )
    const evil = shimScript('/tmp/a b/$(touch x)/node', `/tmp/it's "q"; rm -rf ~/\`id\`/bridge.js`)
    expect(evil).toContain(`'/tmp/a b/$(touch x)/node'`)
    expect(evil).toContain(`'/tmp/it'\\''s "q"; rm -rf ~/\`id\`/bridge.js'`)
  })
})

describe('dây nối', () => {
  const dirs: string[] = []
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
  })
  it('bắt tay', () => {
    expect(parseHello('{"aris":"acp","v":1,"bot":" lam ","cwd":"/x","parent":"buzz-desktop"}')).toEqual({
      aris: 'acp',
      v: 1,
      bot: 'lam',
      cwd: '/x',
      parent: 'buzz-desktop',
    })
    expect(parseHello('{"aris":"acp","v":2,"bot":"lam","cwd":"/x"}')).toBeUndefined()
    expect(parseHello('không phải json')).toBeUndefined()
  })
  it('tên ứng dụng; tìm lệnh trong PATH', () => {
    expect(appName('buzz-desktop')).toBe('Buzz Desktop')
    expect(appName(undefined, 'zed')).toBe('Zed')
    expect(appName()).toBe('Ứng dụng')
    expect(findOnPath('/khong/co:/cung/khong')).toBeUndefined()
  })
  it('luồng JSON từng dòng trên socket, nghe được cả hai chiều', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aris-acp-'))
    dirs.push(dir)
    const path = join(dir, 's.sock')
    const seen: { in: Message[]; out: Message[] } = { in: [], out: [] }
    const done = new Promise<Message[]>((resolve) => {
      const server = createServer((sock) => {
        const stream = socketStream(sock, '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n', {
          in: (m) => seen.in.push(m),
          out: (m) => seen.out.push(m),
        })
        void (async () => {
          const got: Message[] = []
          const reader = stream.readable.getReader()
          const w = stream.writable.getWriter()
          for (;;) {
            const r = await reader.read()
            if (r.done) break
            got.push(r.value)
            await w.write({ jsonrpc: '2.0', id: r.value.id, result: { ok: true } })
            if (got.length === 2) {
              server.close()
              resolve(got)
              sock.end()
            }
          }
        })()
      })
      server.listen(path)
    })
    await new Promise((r) => setTimeout(r, 50))
    const client = connect(path)
    const replies: string[] = []
    client.on('data', (d) => replies.push(d.toString()))
    client.write('{"jsonrpc":"2.0","id":2,"method":"session/new"}\n')
    const got = await done
    expect(got.map((m) => m.method)).toEqual(['initialize', 'session/new'])
    expect(seen.in).toHaveLength(2)
    expect(seen.out.map((m) => m.id)).toEqual([1, 2])
    await new Promise((r) => setTimeout(r, 30))
    expect(replies.join('')).toContain('"id":2')
    client.destroy()
  })
})
