import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  checkConnection,
  cleanMcp,
  connectionOf,
  effectiveAsk,
  McpStore,
  needsAsk,
  parseEnvLines,
  pluginConfig,
  serverNameOf,
  splitCommand,
  viewOf,
} from './mcp.js'
import { memTable } from './testing.js'

const ECHO = fileURLToPath(new URL('../test/echo-mcp.mjs', import.meta.url))

describe('kết nối nền tảng theo bot', () => {
  it('mẫu GitHub cần token, đổi thành header Bearer; khoá không gửi lại giao diện', async () => {
    expect(() => cleanMcp({ preset: 'github' })).toThrow('token')
    const s = new McpStore(memTable())
    const r = await s.add('b-1', { preset: 'github', secrets: { token: 'ghp_x' } })
    expect(r).toMatchObject({
      name: 'GitHub',
      serverName: 'github',
      transport: 'streamable-http',
      ask: 'write',
    })
    expect(pluginConfig(r, '/tmp')).toMatchObject({ headers: { Authorization: 'Bearer ghp_x' } })
    expect(JSON.stringify(viewOf(r))).not.toContain('ghp_x')
    // Sửa mà để trống token: giữ token cũ.
    const u = await s.update(r.id, { secrets: { token: '' }, ask: 'always' })
    expect(u.secrets.token).toBe('ghp_x')
    expect(u.ask).toBe('always')
  })

  it('tự thêm bằng lệnh: tách lệnh, biến môi trường; tên trùng trong bot thì thêm số', async () => {
    expect(splitCommand('npx -y "@a/b c" --x')).toEqual(['npx', '-y', '@a/b c', '--x'])
    expect(parseEnvLines('A=1\n\nB = x=y\nsai\n')).toEqual({ A: '1', B: 'x=y' })
    expect(serverNameOf('Trello Đội', (n) => n === 'trello_doi')).toBe('trello_doi_2')
    const s = new McpStore(memTable())
    const a = await s.add('b-1', {
      preset: 'custom',
      name: 'Echo',
      command: 'node x.mjs',
      secrets: { K: 'v' },
    })
    const b = await s.add('b-1', { preset: 'custom', name: 'Echo', command: 'node x.mjs' })
    const c = await s.add('b-2', { preset: 'custom', name: 'Echo', command: 'node x.mjs' })
    expect([a.serverName, b.serverName, c.serverName]).toEqual(['echo', 'echo_2', 'echo'])
    expect(pluginConfig(a, '/w')).toMatchObject({
      command: 'node',
      args: ['x.mjs'],
      env: { K: 'v' },
      cwd: '/w',
    })
    // Sửa lệnh không gửi khoá: giữ khoá; gửi dòng trống: giữ; bỏ dòng: gỡ.
    expect((await s.update(a.id, { command: 'node y.mjs' })).secrets).toEqual({ K: 'v' })
    expect((await s.update(a.id, { secrets: { K: '', L: '2' } })).secrets).toEqual({ K: 'v', L: '2' })
    expect((await s.update(a.id, { secrets: { L: '' } })).secrets).toEqual({ L: '2' })
    expect(() =>
      cleanMcp({ preset: 'custom', name: 'X', transport: 'streamable-http', url: 'ftp://x' }),
    ).toThrow('URL')
  })

  it('hỏi trước khi ghi: công cụ chỉ đọc thì tự dùng, công cụ khác và công cụ lạ thì hỏi', async () => {
    const s = new McpStore(memTable())
    const r = await s.add('b-1', { preset: 'custom', name: 'Echo', command: 'node x' })
    const checked = (await s.setCheck(r.id, {
      ok: true,
      at: '',
      tools: [
        { name: 'echo', readOnly: true },
        { name: 'take_note', readOnly: false },
      ],
    }))!
    const hit = connectionOf('mcp__echo__echo', s.list('b-1'))!
    expect(hit.raw).toBe('echo')
    expect(needsAsk(checked, 'echo')).toBe(false)
    expect(needsAsk(checked, 'take_note')).toBe(true)
    expect(needsAsk(checked, 'moi')).toBe(true)
    expect(needsAsk({ ...checked, ask: 'never' }, 'take_note')).toBe(false)
    expect(needsAsk({ ...checked, ask: 'always' }, 'echo')).toBe(true)
    expect(connectionOf('mcp__khac__echo', s.list('b-1'))).toBeUndefined()
  })

  it('kết nối thử máy chủ thật trên máy: liệt kê công cụ và công cụ chỉ đọc; lệnh sai thì báo lỗi', async () => {
    const s = new McpStore(memTable())
    const r = await s.add('b-1', { preset: 'custom', name: 'Echo', command: `node ${ECHO}` })
    const ok = await checkConnection(r, process.cwd(), () => ({ PATH: process.env.PATH ?? '' }), 15_000)
    expect(ok).toMatchObject({
      ok: true,
      tools: [
        { name: 'echo', readOnly: true },
        { name: 'take_note', readOnly: false },
      ],
    })
    const bad = await s.add('b-1', { preset: 'custom', name: 'Sai', command: 'khong-co-lenh-nay-aris' })
    const fail = await checkConnection(bad, process.cwd(), () => ({ PATH: process.env.PATH ?? '' }), 15_000)
    expect(fail.ok).toBe(false)
    expect(fail.error).toBeTruthy()
  })

  it('Trình duyệt: công cụ xem coi như chỉ đọc, bấm và chạy mã vẫn hỏi', async () => {
    const s = new McpStore(memTable())
    const r = await s.add('b-1', { preset: 'browser' })
    expect(r.args).toEqual(['-y', '@playwright/mcp@0.0.83', '--headless', '--isolated'])
    const args = pluginConfig(r, '/w').args as string[]
    expect(args.slice(-2)).toEqual(['--output-dir', join(tmpdir(), 'aris-browser', r.serverName)])
    const done = await s.setCheck(r.id, {
      ok: true,
      at: '',
      tools: [
        { name: 'browser_navigate', readOnly: false },
        { name: 'browser_snapshot', readOnly: true },
        { name: 'browser_click', readOnly: false },
        { name: 'browser_evaluate', readOnly: false },
      ],
    })
    expect(done!.check!.tools.filter((t) => t.readOnly).map((t) => t.name)).toEqual([
      'browser_navigate',
      'browser_snapshot',
    ])
  })
})

describe('kết nối dùng chung của đội', () => {
  const bot = (id: string, department?: string) => ({ id, ...(department ? { department } : {}) })

  it('gắn đúng bot trong phạm vi, kể cả theo phòng và "cả đội"; bot ngoài phạm vi không thấy', async () => {
    const s = new McpStore(memTable())
    const own = await s.add('b-1', { preset: 'custom', name: 'Riêng', command: 'node a' })
    const some = await s.addTeam(
      { preset: 'custom', name: 'GitHub', command: 'node g' },
      { bots: ['b-1'], departments: ['tt'] },
    )
    const all = await s.addTeam({ preset: 'custom', name: 'Lịch', command: 'node l' }, { bots: 'all' })
    expect(some.bot).toBe('_doi')
    expect(some.serverName).toBe('doi-github')
    expect(all.serverName).toBe('doi-lich')
    expect(s.forBot(bot('b-1')).map((r) => r.id)).toEqual([own.id, some.id, all.id])
    expect(s.forBot(bot('b-2', 'tt')).map((r) => r.id)).toEqual([some.id, all.id])
    expect(s.forBot(bot('b-3', 'kt')).map((r) => r.id)).toEqual([all.id])
    // Xoá kết nối riêng của bot (xoá bot) không kéo theo kết nối của đội.
    await s.removeBot('b-1')
    expect(s.team()).toHaveLength(2)
  })

  it('tên máy chủ của đội có tiền tố riêng, không trùng kết nối riêng cùng tên và tự thêm số khi trùng', async () => {
    const s = new McpStore(memTable())
    // Lệnh khác nhau: cùng một dịch vụ thì kết nối riêng thắng, kết nối của đội không gắn.
    const own = await s.add('b-1', { preset: 'custom', name: 'Echo', command: 'node b' })
    const t1 = await s.addTeam({ preset: 'custom', name: 'Echo', command: 'node a' }, { bots: 'all' })
    const t2 = await s.addTeam({ preset: 'custom', name: 'Echo', command: 'node a' }, { bots: 'all' })
    expect([own.serverName, t1.serverName, t2.serverName]).toEqual(['echo', 'doi-echo', 'doi-echo_2'])
    expect(connectionOf('mcp__doi-echo__x', s.forBot(bot('b-1')))?.rec.id).toBe(t1.id)
  })

  it('bot tắt riêng thì không còn thấy; đổi phạm vi có hiệu lực ngay; bot tạo sau vẫn nhận khi phạm vi là cả đội', async () => {
    const s = new McpStore(memTable())
    const r = await s.addTeam({ preset: 'custom', name: 'X', command: 'node x' }, { bots: 'all' })
    await s.setBotPref(r.id, 'b-1', { off: true })
    expect(s.forBot(bot('b-1'))).toHaveLength(0)
    expect(s.forBot(bot('b-moi'))).toHaveLength(1)
    await s.setBotPref(r.id, 'b-1', { off: false })
    expect(s.forBot(bot('b-1'))).toHaveLength(1)
    await s.setScope(r.id, { bots: ['b-2', 'b-2', ' '] })
    expect(s.get(r.id)!.scope).toEqual({ bots: ['b-2'] })
    expect(s.forBot(bot('b-1'))).toHaveLength(0)
  })

  it('mức hỏi riêng của bot chỉ được chặt hơn mức chung, không nới hơn', async () => {
    const s = new McpStore(memTable())
    const r0 = await s.addTeam(
      { preset: 'custom', name: 'X', command: 'node x', ask: 'write' },
      { bots: 'all' },
    )
    const r = (await s.setCheck(r0.id, { ok: true, at: '', tools: [{ name: 'doc', readOnly: true }] }))!
    // Chặt hơn: được ghi nhận.
    const strict = await s.setBotPref(r.id, 'b-1', { ask: 'always' })
    expect(needsAsk(strict, 'doc', 'b-1')).toBe(true)
    expect(needsAsk(strict, 'doc', 'b-2')).toBe(false)
    // Nới hơn: bị bỏ, bot vẫn theo mức chung.
    const loose = await s.setBotPref(r.id, 'b-1', { ask: 'never' })
    expect(loose.botAsk).toBeUndefined()
    expect(needsAsk(loose, 'ghi', 'b-1')).toBe(true)
    // Mức chung chặt sẵn thì mức riêng không hạ được.
    const always = { ...loose, ask: 'always' as const, botAsk: { 'b-1': 'never' as const } }
    expect(effectiveAsk(always, 'b-1')).toBe('always')
    expect(effectiveAsk(always)).toBe('always')
  })

  it('khoá của kết nối dùng chung không gửi lại giao diện', async () => {
    const s = new McpStore(memTable())
    const r = await s.addTeam(
      {
        preset: 'custom',
        name: 'X',
        transport: 'streamable-http',
        url: 'https://x.test/mcp',
        secrets: { Authorization: 'Bearer abc' },
      },
      { bots: 'all' },
    )
    expect(JSON.stringify(viewOf(r))).not.toContain('abc')
    expect(viewOf(r).secretKeys).toEqual(['Authorization'])
  })
})

describe('công tắc "Chỉ dùng kết nối được gán"', () => {
  it('được gán thắng dùng chung cùng dịch vụ; bật công tắc thì bỏ hẳn phần dùng chung', async () => {
    const s = new McpStore(memTable())
    const git = {
      preset: 'custom' as const,
      transport: 'streamable-http' as const,
      url: 'https://git.example/mcp',
    }
    const own = await s.add('b-1', { ...git, name: 'Git của Khoa' })
    const sharedGit = await s.addTeam({ ...git, name: 'Git công ty' }, { bots: 'all' })
    const sharedCal = await s.addTeam({ preset: 'custom', name: 'Lịch', command: 'node l' }, { bots: 'all' })
    const named = await s.addTeam({ preset: 'custom', name: 'Kho', command: 'node k' }, { bots: ['b-1'] })
    const ids = (b: Parameters<typeof s.forBot>[0]) => s.forBot(b).map((r) => r.id)
    expect(ids({ id: 'b-1' })).toEqual([own.id, named.id, sharedCal.id])
    expect(ids({ id: 'b-1', connectorsOnlyAssigned: true })).toEqual([own.id, named.id])
    expect(ids({ id: 'b-2' })).toEqual([sharedGit.id, sharedCal.id])
  })
})
