import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanExternal } from '@aris/bots'
import {
  externalBrief,
  ExternalHost,
  inWorktree,
  pathsIn,
  targetDir,
  worktreePlan,
  type PluginModule,
} from './external.js'

const mod: PluginModule = { apply: () => undefined }

function host(installed = true) {
  const mounted: { config: Record<string, unknown>; disposed: boolean }[] = []
  const h = new ExternalHost({
    load: async () => (installed ? mod : undefined),
    mount: (_m, config) => {
      const m = { config, disposed: false }
      mounted.push(m)
      return () => void (m.disposed = true)
    },
    warn: () => undefined,
  })
  return { h, mounted }
}

describe('gắn bot ngoài', () => {
  it('mỗi bot một nhà cung cấp riêng; cấu hình không đổi thì không gắn lại', async () => {
    const { h, mounted } = host()
    const khoa = { id: 'b-1', external: cleanExternal({ agent: 'claude-code' }) }
    await h.sync([khoa, { id: 'b-2' }])
    expect(mounted.map((m) => m.config)).toEqual([{ providerName: 'aris-b-1', permissionMode: 'dontAsk' }])
    expect(h.state('b-1')).toBe('ready')
    await h.sync([khoa])
    expect(mounted).toHaveLength(1)
  })
  it('đổi mức quyền thì gỡ bản cũ, gắn bản mới; xoá bot thì gỡ', async () => {
    const { h, mounted } = host()
    await h.sync([{ id: 'b-1', external: cleanExternal({ agent: 'claude-code' }) }])
    await h.sync([{ id: 'b-1', external: cleanExternal({ agent: 'claude-code', permission: 'plan' }) }])
    expect(mounted.map((m) => [m.config.permissionMode, m.disposed])).toEqual([
      ['dontAsk', true],
      ['plan', false],
    ])
    await h.sync([])
    expect(mounted[1]!.disposed).toBe(true)
    expect(h.state('b-1')).toBe('missing')
  })
  it('chưa cài plugin thì báo thiếu, không gắn', async () => {
    const { h, mounted } = host(false)
    await h.sync([{ id: 'b-1', external: cleanExternal({ agent: 'codex' }) }])
    expect(mounted).toHaveLength(0)
    expect(h.state('b-1')).toBe('missing')
  })
})

describe('việc của bot ngoài', () => {
  it('worktree ngoài repo, nhánh theo tên gọi và tiêu đề không dấu', () => {
    expect(worktreePlan('/u/code/shop-api', 'khoa', 'Sửa lỗi đăng nhập Google', 'abcd1234', '/u')).toEqual({
      branch: 'aris/khoa-sua-loi-dang-nhap-google-1234',
      dir: '/u/.aris/worktrees/shop-api/khoa-sua-loi-dang-nhap-google-1234',
    })
  })
  it('lời giao tự đủ: việc, worktree, cách nộp kết quả', () => {
    const t = externalBrief({
      name: 'Khoa',
      task: 'Sửa lỗi văng đăng nhập',
      reason: 'giỏi sửa mã',
      worktree: { branch: 'aris/khoa-x', dir: '/u/.aris/worktrees/shop/khoa-x' },
    })
    expect(t).toContain('Sửa lỗi văng đăng nhập')
    expect(t).toContain(
      'Thư mục làm việc của bạn: /u/.aris/worktrees/shop/khoa-x (git worktree riêng, nhánh aris/khoa-x)',
    )
    expect(t).toContain('không hỏi lại được')
  })
})

describe('đường dẫn trong worktree', () => {
  it('đường dẫn repo gốc trong nội dung việc đổi thành worktree', () => {
    const wt = { dir: '/u/.aris/worktrees/shop/k-1', repo: '/u/code/shop' }
    expect(inWorktree('Sửa /u/code/shop/src/a.ts rồi chạy test trong /u/code/shop', wt)).toBe(
      'Sửa /u/.aris/worktrees/shop/k-1/src/a.ts rồi chạy test trong /u/.aris/worktrees/shop/k-1',
    )
    expect(inWorktree('không đổi', undefined)).toBe('không đổi')
  })
})

describe('thư mục cho bot ngoài', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'aris-target-')))
  const repo = join(base, 'demo-login')
  const plain = join(base, 'chat')
  mkdirSync(join(repo, 'src'), { recursive: true })
  mkdirSync(plain)
  writeFileSync(join(repo, 'src', 'login.js'), '')
  execFileSync('git', ['init', '-q', repo])
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('lấy đường dẫn tuyệt đối và ~/ trong nội dung việc', () => {
    expect(pathsIn('Sửa lỗi trong repo /u/code/shop. Xem «~/notes/a.md», rồi chạy test.', '/home/x')).toEqual(
      ['/u/code/shop', '/home/x/notes/a.md'],
    )
    expect(pathsIn('không có đường dẫn, chỉ 1/2 phần')).toEqual([])
  })

  it('thư mục Commander nêu được ưu tiên, phải có thật', async () => {
    expect(await targetDir({ explicit: join(repo, 'src'), task: 'x', session: plain })).toEqual({
      dir: join(repo, 'src'),
      root: repo,
    })
    expect(await targetDir({ explicit: 'code/shop', task: 'x' })).toEqual({
      error: 'Thư mục «code/shop» phải là đường dẫn tuyệt đối.',
    })
    expect('error' in (await targetDir({ explicit: join(base, 'khong-co'), task: 'x' }))).toBe(true)
  })

  it('phiên giao không ở trong repo: dùng repo nhắc trong việc', async () => {
    const task = `Sửa lỗi đăng nhập trong ${join(repo, 'src', 'login.js')}, ghi kết quả ra /tmp/ket-qua.txt`
    expect(await targetDir({ task, session: plain })).toEqual({ dir: repo, root: repo })
  })

  it('phiên giao ở trong repo: giữ thư mục của phiên, không đoán từ nội dung', async () => {
    const other = join(base, 'other')
    mkdirSync(other)
    execFileSync('git', ['init', '-q', other])
    expect(await targetDir({ task: `xem ${repo}`, session: other })).toEqual({ dir: other, root: other })
    expect(await targetDir({ task: 'không nêu repo', session: plain })).toEqual({
      dir: plain,
      root: undefined,
    })
  })
})
