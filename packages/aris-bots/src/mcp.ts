/**
 * Kết nối nền tảng theo bot (bản vẽ 2.2c): mỗi bot có máy chủ MCP riêng. Kết nối gắn vào agent
 * của phiên bot (`agent.ctx`), nên công cụ `mcp__<tên>__<công cụ>` chỉ bot đó thấy. Khoá (biến môi
 * trường, header) lưu trên máy, không bao giờ gửi lại giao diện.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { Table } from './domain.js'

/** Mẫu điền sẵn; `custom` là tự thêm bằng lệnh hoặc URL. */
export const MCP_PRESETS = ['github', 'lark', 'notion', 'browser', 'custom'] as const
export type McpPreset = (typeof MCP_PRESETS)[number]

/** Khi bot dùng công cụ của kết nối: hỏi trước khi ghi, hỏi mọi lần, tự dùng. */
export const MCP_ASK = ['write', 'always', 'never'] as const
export type McpAsk = (typeof MCP_ASK)[number]

export const mcpToolInfo = z.object({
  name: z.string(),
  /** Máy chủ khai báo công cụ chỉ đọc (`readOnlyHint`). */
  readOnly: z.boolean(),
})

export const mcpRecord = z.object({
  id: z.string(),
  bot: z.string(),
  /** Tên hiển thị ("GitHub", "Lark"…). */
  name: z.string(),
  /** Tiền tố tên công cụ: `mcp__<serverName>__…`. */
  serverName: z.string(),
  preset: z.enum(MCP_PRESETS),
  transport: z.enum(['stdio', 'streamable-http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  /** Khoá: biến môi trường (stdio) hoặc header (HTTP). */
  secrets: z.record(z.string(), z.string()),
  ask: z.enum(MCP_ASK),
  enabled: z.boolean(),
  /** Lần kiểm tra gần nhất. */
  check: z
    .object({
      ok: z.boolean(),
      at: z.string(),
      error: z.string().optional(),
      tools: z.array(mcpToolInfo),
    })
    .optional(),
  createdAt: z.string(),
})
export type McpRecord = z.infer<typeof mcpRecord>
export type McpCheck = NonNullable<McpRecord['check']>

/** Bản gửi giao diện: không có giá trị khoá, chỉ tên khoá. */
export type McpView = Omit<McpRecord, 'secrets'> & { secretKeys: string[] }

export class McpError extends Error {}

const GITHUB_URL = 'https://api.githubcopilot.com/mcp/'

/** Khoá mỗi mẫu cần (tên biến môi trường hoặc header) và cách chạy. */
export const PRESET_SPEC: Record<
  Exclude<McpPreset, 'custom'>,
  {
    name: string
    transport: McpRecord['transport']
    command?: string
    args?: string[]
    url?: string
    keys: string[]
  }
> = {
  github: { name: 'GitHub', transport: 'streamable-http', url: GITHUB_URL, keys: ['token'] },
  lark: {
    name: 'Lark',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@larksuiteoapi/lark-mcp', 'mcp'],
    keys: ['APP_ID', 'APP_SECRET'],
  },
  notion: {
    name: 'Notion',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    keys: ['NOTION_TOKEN'],
  },
  // Trình duyệt tự động (giai đoạn 4, đợt 5): Playwright MCP bản ghim, chạy ẩn, hồ sơ trình duyệt
  // riêng mỗi lần (không đụng hồ sơ Chrome của người dùng). Dùng Chrome đã cài trên máy.
  browser: {
    name: 'Trình duyệt',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@0.0.83', '--headless', '--isolated'],
    keys: [],
  },
}

/**
 * Công cụ "xem" của Trình duyệt coi như chỉ đọc (máy chủ không đánh dấu): mở trang có rủi ro như
 * `web_fetch` bot đã được dùng. Bấm, gõ, điền, chạy mã trên trang vẫn hỏi.
 */
export const BROWSER_VIEW_TOOLS = new Set([
  'browser_navigate',
  'browser_navigate_back',
  'browser_tabs',
  'browser_close',
  'browser_resize',
  'browser_hover',
])

export const browserCheck = (c: McpCheck): McpCheck => ({
  ...c,
  tools: c.tools.map((t) => (BROWSER_VIEW_TOOLS.has(t.name) ? { ...t, readOnly: true } : t)),
})

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

/** Tiền tố công cụ từ tên hiển thị: `[a-z0-9_-]`, tối đa 24 ký tự, trùng trong bot thì thêm số. */
export function serverNameOf(name: string, taken: (n: string) => boolean): string {
  const root =
    fold(name)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'mcp'
  if (!taken(root)) return root
  for (let i = 2; ; i++) if (!taken(`${root}_${i}`)) return `${root}_${i}`
}

/** Tách "TÊN=giá trị" mỗi dòng; dòng trống, dòng không có "=" bị bỏ. */
export function parseEnvLines(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf('=')
    if (i <= 0) continue
    const k = line.slice(0, i).trim()
    if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(k)) out[k] = line.slice(i + 1).trim()
  }
  return out
}

/** Lệnh một dòng thành lệnh và tham số (tách theo khoảng trắng, giữ chuỗi trong ngoặc kép). */
export function splitCommand(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]!)
}

/** Dữ liệu từ hộp "Thêm kết nối". */
export interface McpInput {
  preset: McpPreset
  name?: string
  /** Tự thêm: `stdio` (lệnh trên máy) hay `streamable-http` (URL). */
  transport?: McpRecord['transport']
  command?: string
  url?: string
  /** Khoá theo tên; giá trị rỗng khi sửa là giữ khoá cũ. */
  secrets?: Record<string, string>
  ask?: McpAsk
  enabled?: boolean
}

/** Làm sạch dữ liệu từ giao diện thành bản ghi (chưa có `id`, `bot`, `serverName`). */
export function cleanMcp(
  input: McpInput,
  prev?: McpRecord,
): Omit<McpRecord, 'id' | 'bot' | 'serverName' | 'createdAt' | 'check'> {
  const preset = (MCP_PRESETS as readonly string[]).includes(input.preset) ? input.preset : prev?.preset
  if (!preset) throw new McpError('Chọn một nền tảng.')
  const given = Object.fromEntries(
    Object.entries(input.secrets ?? {})
      .map(([k, v]) => [k.trim(), String(v).trim()] as const)
      .filter(([k]) => k),
  )
  // Khoá để trống khi sửa: giữ giá trị cũ.
  const secrets: Record<string, string> = {}
  const ask = (MCP_ASK as readonly string[]).includes(input.ask ?? '') ? input.ask! : (prev?.ask ?? 'write')
  const enabled = input.enabled ?? prev?.enabled ?? true
  if (preset !== 'custom') {
    const spec = PRESET_SPEC[preset]
    for (const k of spec.keys) {
      const v = given[k] || prev?.secrets[k]
      if (!v) throw new McpError(`Cần điền ${k === 'token' ? 'token' : k}.`)
      secrets[k] = v
    }
    return {
      name: (input.name?.trim() || spec.name).slice(0, 40),
      preset,
      transport: spec.transport,
      ...(spec.command ? { command: spec.command, args: spec.args ?? [] } : {}),
      ...(spec.url ? { url: spec.url } : {}),
      secrets,
      ask,
      enabled,
    }
  }
  const name = (input.name ?? prev?.name ?? '').trim().slice(0, 40)
  if (!name) throw new McpError('Đặt tên cho kết nối.')
  const transport = input.transport ?? prev?.transport ?? 'stdio'
  // Không gửi khoá: giữ nguyên. Có gửi: dòng có giá trị là khoá mới, dòng để trống giữ giá trị cũ,
  // khoá cũ không còn dòng nào là gỡ.
  if (input.secrets === undefined) Object.assign(secrets, prev?.secrets)
  for (const [k, v] of Object.entries(given)) if (v) secrets[k] = v
  for (const [k, v] of Object.entries(prev?.secrets ?? {})) if (k in given && !given[k]) secrets[k] = v
  if (transport === 'stdio') {
    const line =
      input.command !== undefined ? input.command : [prev?.command, ...(prev?.args ?? [])].join(' ')
    const [command, ...args] = splitCommand(line.trim())
    if (!command)
      throw new McpError('Cần lệnh khởi chạy, ví dụ: npx -y @modelcontextprotocol/server-everything')
    return { name, preset, transport, command, args, secrets, ask, enabled }
  }
  const url = (input.url ?? prev?.url ?? '').trim()
  if (!/^https?:\/\//.test(url)) throw new McpError('URL phải bắt đầu bằng http:// hoặc https://')
  return { name, preset, transport, url, secrets, ask, enabled }
}

/** Header gửi máy chủ HTTP: mẫu GitHub đổi token thành `Authorization: Bearer`. */
function headersOf(r: McpRecord): Record<string, string> {
  if (r.preset === 'github') return { Authorization: `Bearer ${r.secrets.token ?? ''}` }
  return { ...r.secrets }
}

/** Lệnh chạy: mẫu Lark truyền App ID / Secret qua tham số dòng lệnh, mẫu Trình duyệt thêm thư mục ra. */
function launchOf(r: McpRecord): { command: string; args: string[]; env: Record<string, string> } {
  const args = [...(r.args ?? [])]
  if (r.preset === 'lark') args.push('-a', r.secrets.APP_ID ?? '', '-s', r.secrets.APP_SECRET ?? '')
  // Tệp chụp trang của Playwright ghi vào thư mục tạm, không rơi vào thư mục làm việc của bot.
  if (r.preset === 'browser' && !args.includes('--output-dir'))
    args.push('--output-dir', join(tmpdir(), 'aris-browser', r.serverName))
  return { command: r.command ?? '', args, env: r.preset === 'lark' ? {} : { ...r.secrets } }
}

/** Cấu hình plugin `@deepseek-ai/dsh-mcp-client` cho một kết nối. */
export function pluginConfig(r: McpRecord, cwd: string): Record<string, unknown> {
  if (r.transport === 'streamable-http')
    return { transport: 'streamable-http', serverName: r.serverName, url: r.url, headers: headersOf(r) }
  return { transport: 'stdio', serverName: r.serverName, cwd, ...launchOf(r) }
}

/** Bản gửi giao diện, bỏ giá trị khoá. */
export function viewOf(r: McpRecord): McpView {
  const { secrets, ...rest } = r
  return { ...rest, secretKeys: Object.keys(secrets) }
}

/** Công cụ `mcp__<server>__<raw>` thuộc kết nối nào của bot; trả cả tên gốc. */
export function connectionOf(
  tool: string,
  list: readonly McpRecord[],
): { rec: McpRecord; raw: string } | undefined {
  for (const rec of list) {
    const prefix = `mcp__${rec.serverName}__`
    if (tool.startsWith(prefix)) return { rec, raw: tool.slice(prefix.length) }
  }
  return undefined
}

/** Có cần hỏi người dùng trước khi chạy công cụ này không. Công cụ chưa biết coi là công cụ ghi. */
export function needsAsk(rec: McpRecord, raw: string): boolean {
  if (rec.ask === 'never') return false
  if (rec.ask === 'always') return true
  return !rec.check?.tools.some((t) => t.readOnly && t.name === raw)
}

/** Kho kết nối: một bảng của domain `aris_bots`, khoá là `id`. */
export class McpStore {
  constructor(
    private readonly table: Table<McpRecord>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(bot?: string): McpRecord[] {
    return [...this.table.entries()]
      .map(([, r]) => r)
      .filter((r) => !bot || r.bot === bot)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  get(id: string): McpRecord | undefined {
    return this.table.get(id)
  }

  async add(bot: string, input: McpInput): Promise<McpRecord> {
    const clean = cleanMcp(input)
    const taken = new Set(this.list(bot).map((r) => r.serverName))
    let id: string
    do id = `m-${Math.random().toString(16).slice(2, 8)}`
    while (this.table.get(id))
    const rec: McpRecord = {
      ...clean,
      id,
      bot,
      serverName: serverNameOf(clean.name, (n) => taken.has(n)),
      createdAt: this.now().toISOString(),
    }
    await this.table.put(id, rec)
    return rec
  }

  async update(id: string, input: Partial<McpInput>): Promise<McpRecord> {
    const prev = this.table.get(id)
    if (!prev) throw new McpError('Không có kết nối này.')
    const clean = cleanMcp({ preset: prev.preset, ...input } as McpInput, prev)
    // Đổi cách chạy hoặc khoá thì kết quả kiểm tra cũ không còn đúng.
    const same =
      clean.command === prev.command &&
      clean.url === prev.url &&
      JSON.stringify(clean.args) === JSON.stringify(prev.args) &&
      JSON.stringify(clean.secrets) === JSON.stringify(prev.secrets)
    const rec: McpRecord = {
      ...prev,
      ...clean,
      ...(same && prev.check ? { check: prev.check } : {}),
    }
    if (!same) delete rec.check
    await this.table.put(id, rec)
    return rec
  }

  async setCheck(id: string, check: McpCheck): Promise<McpRecord | undefined> {
    const prev = this.table.get(id)
    if (!prev) return undefined
    const rec = { ...prev, check: prev.preset === 'browser' ? browserCheck(check) : check }
    await this.table.put(id, rec)
    return rec
  }

  async remove(id: string): Promise<void> {
    await this.table.delete(id)
  }

  /** Xoá mọi kết nối của bot (khi xoá bot). */
  async removeBot(bot: string): Promise<void> {
    for (const r of this.list(bot)) await this.table.delete(r.id)
  }
}

/** Kết nối thử: mở, liệt kê công cụ, đóng. Lỗi trả lời bằng lời dễ hiểu. */
export async function checkConnection(
  r: McpRecord,
  cwd: string,
  env: () => Record<string, string>,
  timeoutMs = 60_000,
): Promise<McpCheck> {
  const at = new Date().toISOString()
  const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client')
  const client = new Client({ name: 'aris', version: '0.0.0' }, { capabilities: {} })
  let transport: Parameters<typeof client.connect>[0]
  if (r.transport === 'streamable-http') {
    transport = new StreamableHTTPClientTransport(new URL(r.url ?? ''), {
      requestInit: { headers: headersOf(r) },
    })
  } else {
    const { StdioClientTransport } = await import('@modelcontextprotocol/client/stdio')
    const l = launchOf(r)
    transport = new StdioClientTransport({
      command: l.command,
      args: l.args,
      env: { ...env(), ...l.env },
      cwd,
      stderr: 'pipe',
    })
  }
  const timer = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new McpError(`quá ${Math.round(timeoutMs / 1000)} giây không trả lời`)),
      timeoutMs,
    ),
  )
  try {
    const tools = await Promise.race([
      (async () => {
        await client.connect(transport)
        const res = await client.listTools()
        return res.tools.map((t) => ({ name: t.name, readOnly: t.annotations?.readOnlyHint === true }))
      })(),
      timer,
    ])
    return { ok: true, at, tools }
  } catch (e) {
    return { ok: false, at, error: explain(e), tools: [] }
  } finally {
    await client.close().catch(() => undefined)
  }
}

/** Lỗi kết nối thành lời ngắn tiếng Việt, giữ phần chi tiết gốc. */
export function explain(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/ENOENT/.test(msg)) return `Không tìm thấy lệnh trên máy (${msg})`
  if (/401|Unauthorized|403|Forbidden/i.test(msg)) return `Khoá sai hoặc thiếu quyền (${msg})`
  if (/ECONNREFUSED|ENOTFOUND|fetch failed/i.test(msg)) return `Không kết nối được tới máy chủ (${msg})`
  if (/Connection closed/i.test(msg)) return `Máy chủ tắt ngay khi mở: thường do khoá sai hoặc thiếu (${msg})`
  return msg
}
