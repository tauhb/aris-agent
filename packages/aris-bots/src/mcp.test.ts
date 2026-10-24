import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  checkConnection,
  cleanMcp,
  connectionOf,
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
        { name: 'ghi_chu', readOnly: false },
      ],
    }))!
    const hit = connectionOf('mcp__echo__echo', s.list('b-1'))!
    expect(hit.raw).toBe('echo')
    expect(needsAsk(checked, 'echo')).toBe(false)
    expect(needsAsk(checked, 'ghi_chu')).toBe(true)
    expect(needsAsk(checked, 'moi')).toBe(true)
    expect(needsAsk({ ...checked, ask: 'never' }, 'ghi_chu')).toBe(false)
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
        { name: 'ghi_chu', readOnly: false },
      ],
    })
    const bad = await s.add('b-1', { preset: 'custom', name: 'Sai', command: 'khong-co-lenh-nay-aris' })
    const fail = await checkConnection(bad, process.cwd(), () => ({ PATH: process.env.PATH ?? '' }), 15_000)
    expect(fail.ok).toBe(false)
    expect(fail.error).toBeTruthy()
  })
})
