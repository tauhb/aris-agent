import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { handleApi, type ApiDeps } from './api.js'
import {
  candidateInput,
  candidateView,
  discoverMcp,
  parseClaudeConfig,
  parseCodexConfig,
  parseToml,
  sameServer,
  type ImportScan,
} from './mcp-import.js'
import { McpStore, type McpCheck } from './mcp.js'
import { memTable } from './testing.js'

describe('đọc TOML của Codex', () => {
  it('bảng lồng, chuỗi, số, bool, mảng nhiều dòng, bảng một dòng, tên có dấu chấm trong ngoặc kép', () => {
    const t = parseToml(`
# chú thích
model = "gpt" # sau dòng
[mcp_servers.a]
command = "node"
args = [
  "x.js",   # chú thích trong mảng
  'y z',
]
enabled = false
timeout = 1_000
[mcp_servers.a.env]
K = "v#1"
[mcp_servers."b.c"]
url = "https://x.test/mcp"
http_headers = { Authorization = "Bearer t", "X-Y" = "1" }
[[tools]]
ignored = true
`)
    expect(t.model).toBe('gpt')
    const s = t.mcp_servers as Record<string, Record<string, unknown>>
    expect(s.a).toMatchObject({
      command: 'node',
      args: ['x.js', 'y z'],
      enabled: false,
      timeout: 1000,
      env: { K: 'v#1' },
    })
    expect(s['b.c']).toMatchObject({
      url: 'https://x.test/mcp',
      http_headers: { Authorization: 'Bearer t', 'X-Y': '1' },
    })
  })
})

describe('máy chủ MCP của Codex', () => {
  it('lấy máy chủ chạy được, bỏ máy chủ tắt, ứng dụng bên thứ ba và đường dẫn tương đối', () => {
    const scan = parseCodexConfig(
      `
[mcp_servers.heygen]
url = "https://mcp.heygen.com/mcp/v1/"

[mcp_servers.computer-use]
command = "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient"
args = ["mcp"]
enabled = false

[mcp_servers.thuduc]
command = "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl"

[mcp_servers.tuongdoi]
command = "./tool"

[mcp_servers.local]
command = "npx"
args = ["-y", "some-mcp@1.2.3"]
[mcp_servers.local.env]
API_KEY = "sk-secret"

[mcp_servers.vault]
url = "https://v.test/mcp"
bearer_token_env_var = "VAULT_TOKEN"
`,
      {},
    )
    expect(scan.candidates.map((c) => c.name)).toEqual(['heygen', 'local', 'vault'])
    expect(scan.skipped.map((s) => s.name)).toEqual(['computer-use', 'thuduc', 'tuongdoi'])
    const local = scan.candidates.find((c) => c.name === 'local')!
    expect(local).toMatchObject({ transport: 'stdio', command: 'npx', args: ['-y', 'some-mcp@1.2.3'] })
    expect(local.secrets).toEqual({ API_KEY: 'sk-secret' })
    // Token đọc từ biến môi trường mà daemon không có: để người dùng nhập tay.
    const vault = scan.candidates.find((c) => c.name === 'vault')!
    expect(vault.needs).toEqual(['Authorization'])
    expect(vault.secrets).toEqual({})
  })

  it('token từ biến môi trường có sẵn thì thành header Authorization', () => {
    const scan = parseCodexConfig(
      '[mcp_servers.v]\nurl = "https://v.test/mcp"\nbearer_token_env_var = "T"\n',
      { T: 'abc' },
    )
    expect(scan.candidates[0]!.secrets).toEqual({ Authorization: 'Bearer abc' })
    expect(scan.candidates[0]!.needs).toEqual([])
  })
})

describe('máy chủ MCP của Claude Code', () => {
  it('đọc gốc và từng dự án, gộp trùng, phân biệt cùng tên khác cấu hình, bỏ SSE', () => {
    const scan = parseClaudeConfig(
      {
        mcpServers: {
          github: {
            type: 'http',
            url: 'https://api.githubcopilot.com/mcp/',
            headers: { Authorization: 'Bearer g' },
          },
          fs: { command: 'npx', args: ['-y', 'fs-mcp'], env: { ROOT: '/tmp' } },
          cu: { type: 'sse', url: 'https://old.test/sse' },
        },
        projects: {
          '/Users/a/proj1': { mcpServers: { fs: { command: 'npx', args: ['-y', 'fs-mcp'] } } },
          '/Users/a/proj2': {
            mcpServers: { fs: { command: 'node', args: ['khac.js'] }, tat: { command: 'x', disabled: true } },
          },
        },
      },
      {},
    )
    expect(scan.candidates.map((c) => c.name)).toEqual(['github', 'fs', 'fs (proj2)'])
    expect(scan.skipped.map((s) => s.name)).toEqual(['cu', 'tat'])
    expect(scan.candidates[0]).toMatchObject({
      transport: 'streamable-http',
      secrets: { Authorization: 'Bearer g' },
    })
    expect(scan.candidates[1]!.key).toBe('claude-code:fs')
  })

  it('tệp không phải đối tượng hay không có máy chủ thì không lỗi', () => {
    expect(parseClaudeConfig(null).candidates).toEqual([])
    expect(parseClaudeConfig({ mcpServers: 3 }).candidates).toEqual([])
  })
})

describe('bản gửi giao diện và dữ liệu tạo kết nối', () => {
  const scan = parseCodexConfig(
    '[mcp_servers.l]\ncommand = "npx"\nargs = ["-y", "a b"]\n[mcp_servers.l.env]\nK = "bimat"\n',
    {},
  )
  it('giao diện chỉ thấy tên khoá, không thấy giá trị', () => {
    const v = candidateView(scan.candidates[0]!)
    expect(v.secretKeys).toEqual(['K'])
    expect(JSON.stringify(v)).not.toContain('bimat')
  })
  it('lệnh một dòng, tham số có khoảng trắng đặt trong ngoặc kép', () => {
    expect(candidateInput(scan.candidates[0]!)).toMatchObject({
      preset: 'custom',
      transport: 'stdio',
      command: 'npx -y "a b"',
      secrets: { K: 'bimat' },
    })
  })
  it('nhận ra máy chủ đã có trong aris', async () => {
    const s = new McpStore(memTable())
    const r = await s.addTeam(candidateInput(scan.candidates[0]!), { bots: 'all' })
    expect(sameServer(scan.candidates[0]!, r)).toBe(true)
    expect(sameServer({ ...scan.candidates[0]!, args: ['x'] }, r)).toBe(false)
  })
})

describe('quét cấu hình trên máy', () => {
  it('đọc tệp của cả hai công cụ; tệp hỏng thì ghi vào danh sách bỏ qua, tệp thiếu thì lặng lẽ bỏ qua', async () => {
    const home = await mkdtemp(join(tmpdir(), 'aris-imp-'))
    await mkdir(join(home, '.codex'), { recursive: true })
    await mkdir(join(home, '.claude'), { recursive: true })
    await writeFile(
      join(home, '.claude.json'),
      JSON.stringify({ mcpServers: { a: { command: 'node', args: ['a.js'] } } }),
    )
    await writeFile(join(home, '.claude', 'settings.json'), '{hỏng')
    await writeFile(join(home, '.codex', 'config.toml'), '[mcp_servers.b]\nurl = "https://b.test/mcp"\n')
    const scan = await discoverMcp(home, {})
    expect(scan.candidates.map((c) => c.key)).toEqual(['claude-code:a', 'codex:b'])
    expect(scan.skipped).toEqual([
      { source: 'claude-code', name: 'settings.json', reason: 'Không đọc được tệp cấu hình.' },
    ])
    const empty = await mkdtemp(join(tmpdir(), 'aris-imp-'))
    expect(await discoverMcp(empty, {})).toEqual({ candidates: [], skipped: [] })
  })
})

describe('API quét và nhập', () => {
  const scan: ImportScan = parseCodexConfig(
    '[mcp_servers.l]\ncommand = "npx"\nargs = ["-y", "x"]\n[mcp_servers.l.env]\nK = "bimat"\n[mcp_servers.h]\nurl = "https://h.test/mcp"\n',
    {},
  )
  function deps() {
    const mcp = new McpStore(memTable())
    const checked: string[] = []
    const d = {
      store: { list: () => [], owner: () => ({}), departments: () => [], get: () => undefined },
      templates: async () => [],
      mcp,
      checkMcp: async (r): Promise<McpCheck> => {
        checked.push(r.serverName)
        return { ok: true, at: '', tools: [{ name: 'doc', readOnly: true }] }
      },
      scanMcp: async () => scan,
    } as unknown as ApiDeps
    return { d, mcp, checked }
  }
  const post = (d: ApiDeps, body: unknown) =>
    handleApi(d, new Request('http://x/api/aris/bots', { method: 'POST', body: JSON.stringify(body) }))

  it('quét không trả giá trị khoá; nhập tạo kết nối của đội, kiểm tra từng cái, dùng hết mã quét', async () => {
    const { d, mcp, checked } = deps()
    const res = await post(d, { op: 'mcp-import-scan' })
    const body = (await res.json()) as { scanId: string; candidates: { key: string; exists: boolean }[] }
    expect(JSON.stringify(body)).not.toContain('bimat')
    expect(body.candidates.map((c) => c.key)).toEqual(['codex:l', 'codex:h'])
    expect(body.candidates.every((c) => !c.exists)).toBe(true)

    const done = await post(d, {
      op: 'mcp-import',
      scanId: body.scanId,
      keys: ['codex:l', 'codex:khong-co'],
      scope: { bots: ['b-1'] },
      ask: 'always',
    })
    expect(done.status).toBe(200)
    const team = mcp.team()
    expect(team).toHaveLength(1)
    expect(team[0]).toMatchObject({
      name: 'l',
      serverName: 'doi-l',
      ask: 'always',
      scope: { bots: ['b-1'] },
      secrets: { K: 'bimat' },
    })
    expect(team[0]!.check?.ok).toBe(true)
    expect(checked).toEqual(['doi-l'])
    expect(JSON.stringify(await done.json())).not.toContain('bimat')

    // Mã quét chỉ dùng được một lần; chưa chọn gì thì báo lỗi.
    expect((await post(d, { op: 'mcp-import', scanId: body.scanId, keys: ['codex:h'] })).status).toBe(400)
  })

  it('quét lại sẽ đánh dấu máy chủ đã có', async () => {
    const { d, mcp } = deps()
    await mcp.addTeam(candidateInput(scan.candidates[0]!), { bots: 'all' })
    const body = (await (await post(d, { op: 'mcp-import-scan' })).json()) as {
      candidates: { key: string; exists: boolean }[]
    }
    expect(body.candidates.map((c) => c.exists)).toEqual([true, false])
  })

  it('đổi phạm vi, tắt riêng bot và mức hỏi qua API; mức hỏi nới hơn bị bỏ', async () => {
    const { d, mcp } = deps()
    ;(d.store as unknown as { get: (id: string) => unknown }).get = (id) => ({ id })
    const r = await mcp.addTeam({ preset: 'custom', name: 'X', command: 'node x' }, { bots: 'all' })
    expect(
      (await post(d, { op: 'mcp-team-scope', id: r.id, scope: { bots: ['b-1'], departments: ['tt'] } }))
        .status,
    ).toBe(200)
    expect(mcp.get(r.id)!.scope).toEqual({ bots: ['b-1'], departments: ['tt'] })
    await post(d, { op: 'mcp-team-bot', id: r.id, bot: 'b-1', off: true, ask: 'always' })
    expect(mcp.get(r.id)).toMatchObject({ off: ['b-1'], botAsk: { 'b-1': 'always' } })
    await post(d, { op: 'mcp-team-bot', id: r.id, bot: 'b-1', ask: 'never' })
    expect(mcp.get(r.id)!.botAsk).toBeUndefined()
  })
})
