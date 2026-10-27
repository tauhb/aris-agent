import { describe, expect, it } from 'vitest'
import { CATALOG, catalogEntry, catalogProblems, catalogView, presetEntry, unpinned } from './catalog.js'
import {
  cleanMcp,
  isOAuth,
  McpStore,
  mcpRecord,
  MCP_PRESETS,
  PRESET_SPEC,
  pluginConfig,
  viewOf,
} from './mcp.js'
import { memTable } from './testing.js'

describe('danh mục connector', () => {
  it('mọi mục hợp lệ, không trùng mã', () => {
    expect(catalogProblems()).toEqual([])
    expect(catalogProblems([{ ...CATALOG[0]!, url: 'http://x' }, CATALOG[0]!])).toEqual(
      expect.arrayContaining([expect.stringContaining('https'), expect.stringContaining('trùng')]),
    )
  })

  it('gói chạy bằng npx đều ghim đúng phiên bản', () => {
    for (const e of CATALOG) expect(unpinned(e), e.id).toEqual([])
    expect(unpinned({ ...CATALOG[0]!, command: 'npx', args: ['-y', '@a/b'] })).toEqual(['@a/b'])
    // Mẫu cũ dùng cùng lệnh với danh mục.
    for (const p of MCP_PRESETS)
      if (p !== 'custom') expect(PRESET_SPEC[p].args ?? []).toEqual(presetEntry(p)?.args ?? [])
  })

  it('đợt 1 (đã kiểm): Notion, HubSpot, Canva, Meta Ads; Google Workspace chưa kiểm được địa chỉ', () => {
    for (const id of ['notion', 'hubspot', 'canva', 'meta-ads'])
      expect(catalogEntry(id)).toMatchObject({ status: 'verified', auth: 'oauth', official: true })
    expect(catalogEntry('google-workspace')).toMatchObject({ status: 'unverified', auth: 'oauth' })
    expect(catalogEntry('google-workspace')?.url).toBeUndefined()
  })

  it('bản gửi giao diện không có hàm', () => {
    expect(JSON.stringify(catalogView())).not.toContain('function')
    expect(catalogView().find((e) => e.id === 'github')).not.toHaveProperty('header')
  })

  it('bốn mẫu cũ là mục của danh mục; kết nối đã lưu theo mẫu cũ vẫn đọc được', () => {
    for (const p of ['github', 'lark', 'notion', 'browser'] as const) expect(presetEntry(p)?.preset).toBe(p)
    const old = {
      id: 'm-1',
      bot: 'b-1',
      name: 'GitHub',
      serverName: 'github',
      preset: 'github',
      transport: 'streamable-http',
      url: 'https://api.githubcopilot.com/mcp/',
      secrets: { token: 'ghp_x' },
      ask: 'write',
      enabled: true,
      createdAt: 'x',
    }
    expect(mcpRecord.parse(old)).toMatchObject({ preset: 'github' })
    expect(isOAuth(mcpRecord.parse(old))).toBe(false)
  })
})

describe('kết nối dựng từ danh mục', () => {
  it('OAuth tự đăng ký (Notion): không cần khoá; header chỉ có token truy cập', async () => {
    const s = new McpStore(memTable())
    const r = await s.addTeam({ preset: 'custom', catalog: 'notion' }, { bots: 'all' })
    expect(r).toMatchObject({
      catalog: 'notion',
      preset: 'custom',
      name: 'Notion',
      url: 'https://mcp.notion.com/mcp',
      ask: 'write',
    })
    expect(isOAuth(r)).toBe(true)
    expect(pluginConfig(r, '/tmp')).toMatchObject({ headers: {} })
    expect(pluginConfig(r, '/tmp', 'at-1')).toMatchObject({ headers: { Authorization: 'Bearer at-1' } })
  })

  it('OAuth cần client riêng (HubSpot): bắt buộc Client ID / Secret, và secret không bao giờ thành header', async () => {
    expect(() => cleanMcp({ preset: 'custom', catalog: 'hubspot' })).toThrow('CLIENT_ID')
    const s = new McpStore(memTable())
    const r = await s.addTeam(
      { preset: 'custom', catalog: 'hubspot', secrets: { CLIENT_ID: 'id', CLIENT_SECRET: 'shh' } },
      { bots: 'all' },
    )
    expect(JSON.stringify(pluginConfig(r, '/tmp', 'at-1'))).not.toContain('shh')
    expect(JSON.stringify(viewOf(r))).not.toContain('shh')
    expect(viewOf(r).secretKeys).toEqual(['CLIENT_ID', 'CLIENT_SECRET'])
    // Sửa mà để trống: giữ khoá cũ; đổi mức hỏi.
    const u = await s.update(r.id, { secrets: { CLIENT_SECRET: '' }, ask: 'always' })
    expect(u.secrets.CLIENT_SECRET).toBe('shh')
    expect(u.ask).toBe('always')
  })

  it('mục không có địa chỉ (Google Workspace) thì người dùng điền, phải là https', () => {
    const keys = { CLIENT_ID: 'id', CLIENT_SECRET: 's' }
    expect(() => cleanMcp({ preset: 'custom', catalog: 'google-workspace', secrets: keys })).toThrow('https')
    expect(() =>
      cleanMcp({ preset: 'custom', catalog: 'google-workspace', secrets: keys, url: 'http://x' }),
    ).toThrow('https')
    expect(
      cleanMcp({ preset: 'custom', catalog: 'google-workspace', secrets: keys, url: 'https://g.example/mcp' })
        .url,
    ).toBe('https://g.example/mcp')
  })

  it('mục dùng token (HighLevel): khoá đổi thành header theo mục', () => {
    const c = cleanMcp({
      preset: 'custom',
      catalog: 'highlevel',
      url: 'https://hl.example/mcp',
      secrets: { TOKEN: 'pit-1', LOCATION_ID: 'loc' },
    })
    const cfg = pluginConfig({ ...c, id: 'x', bot: 'b', serverName: 'hl', createdAt: 'x' }, '/tmp')
    expect(cfg).toMatchObject({ headers: { Authorization: 'Bearer pit-1', locationId: 'loc' } })
  })

  it('mục lạ, hay mục là mẫu cũ, thì báo lỗi', () => {
    expect(() => cleanMcp({ preset: 'custom', catalog: 'khong-co' })).toThrow('danh mục')
    expect(() => cleanMcp({ preset: 'custom', catalog: 'github' })).toThrow('mẫu có sẵn')
  })
})
