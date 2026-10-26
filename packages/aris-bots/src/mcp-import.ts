/**
 * Nhập máy chủ MCP mà người dùng đã cấu hình trong Claude Code (`~/.claude.json`, `~/.claude/settings.json`) và Codex
 * (`~/.codex/config.toml`). Chỉ đọc; giá trị khoá (biến môi trường, header) chỉ đi vào kho kết nối của aris, không bao
 * giờ vào log hay giao diện (giao diện chỉ thấy tên khoá).
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { McpInput, McpRecord } from './mcp.js'

export type ImportSource = 'claude-code' | 'codex'

/** Một máy chủ tìm được, đủ để tạo kết nối `custom`. `secrets` không được gửi giao diện. */
export interface ImportCandidate {
  key: string
  source: ImportSource
  name: string
  transport: McpRecord['transport']
  command?: string
  args?: string[]
  url?: string
  secrets: Record<string, string>
  /** Khoá cần người dùng nhập tay (ví dụ token đọc từ biến môi trường mà daemon không có). */
  needs: string[]
  note?: string
}

export interface ImportSkipped {
  source: ImportSource
  name: string
  reason: string
}

export interface ImportScan {
  candidates: ImportCandidate[]
  skipped: ImportSkipped[]
}

/** Bản gửi giao diện: chỉ tên khoá, không có giá trị. */
export function candidateView(c: ImportCandidate) {
  const { secrets, ...rest } = c
  return { ...rest, secretKeys: Object.keys(secrets) }
}

/** Máy chủ chỉ chạy được bên trong ứng dụng của bên thứ ba, hay trỏ vào phần mềm có giấy phép riêng. */
const THIRD_PARTY = [/\/Applications\/ChatGPT\.app/i, /Codex Computer Use\.app/i, /SkyComputerUseClient/i]

const isThirdParty = (...parts: (string | undefined)[]) =>
  parts.some((p) => !!p && THIRD_PARTY.some((re) => re.test(p)))

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
const strMap = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {}
  if (v && typeof v === 'object' && !Array.isArray(v))
    for (const [k, x] of Object.entries(v))
      if (typeof x === 'string' || typeof x === 'number') out[k] = String(x)
  return out
}

interface RawServer {
  /** `stdio`, `http` (streamable), `sse`. */
  type?: string
  command?: string
  args: string[]
  url?: string
  env: Record<string, string>
  headers: Record<string, string>
  bearerEnvVar?: string
  disabled: boolean
  cwd?: string
}

function candidateOf(
  source: ImportSource,
  name: string,
  raw: RawServer,
  env: NodeJS.ProcessEnv,
): { candidate?: ImportCandidate; skipped?: ImportSkipped } {
  const skip = (reason: string) => ({ skipped: { source, name, reason } })
  if (raw.disabled) return skip('Đang tắt trong ứng dụng gốc.')
  if (isThirdParty(raw.command, raw.url, ...raw.args, ...Object.values(raw.env)))
    return skip('Chỉ chạy được bên trong ứng dụng của bên thứ ba, không dùng ngoài ứng dụng đó.')
  const key = `${source}:${name}`
  if (raw.url) {
    if (raw.type === 'sse') return skip('Kiểu SSE cũ chưa được hỗ trợ (chỉ nhận HTTP).')
    if (!/^https?:\/\//.test(raw.url)) return skip('Địa chỉ không phải http hay https.')
    const secrets = { ...raw.headers }
    const needs: string[] = []
    if (raw.bearerEnvVar) {
      const token = env[raw.bearerEnvVar]
      if (token) secrets.Authorization = `Bearer ${token}`
      else needs.push('Authorization')
    }
    return {
      candidate: {
        key,
        source,
        name,
        transport: 'streamable-http',
        url: raw.url,
        secrets,
        needs,
        ...(needs.length ? { note: `Token nằm ở biến môi trường ${raw.bearerEnvVar}, cần nhập lại.` } : {}),
      },
    }
  }
  if (!raw.command) return skip('Không có lệnh khởi chạy hay địa chỉ.')
  // Đường dẫn tương đối (`./app/...`) chỉ có nghĩa trong thư mục của ứng dụng gốc.
  if (/^\.\.?\//.test(raw.command)) return skip('Lệnh dùng đường dẫn tương đối, không chạy được từ aris.')
  return {
    candidate: {
      key,
      source,
      name,
      transport: 'stdio',
      command: raw.command,
      args: raw.args,
      secrets: { ...raw.env },
      needs: [],
    },
  }
}

// --- Claude Code --------------------------------------------------------------------------------------------

function claudeServer(v: unknown): RawServer | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  return {
    ...(str(o.type) ? { type: str(o.type)! } : {}),
    ...(str(o.command) ? { command: str(o.command)! } : {}),
    args: strList(o.args),
    ...(str(o.url) ? { url: str(o.url)! } : {}),
    env: strMap(o.env),
    headers: strMap(o.headers),
    disabled: o.disabled === true || o.enabled === false,
  }
}

/** Máy chủ trong `~/.claude.json` (gốc và từng dự án) hay `settings.json`. Cùng tên, cùng cấu hình thì gộp. */
export function parseClaudeConfig(doc: unknown, env: NodeJS.ProcessEnv = process.env): ImportScan {
  const out: ImportScan = { candidates: [], skipped: [] }
  if (!doc || typeof doc !== 'object') return out
  const root = doc as Record<string, unknown>
  const groups: { where: string; servers: unknown }[] = [{ where: '', servers: root.mcpServers }]
  const projects = root.projects
  if (projects && typeof projects === 'object')
    for (const [path, p] of Object.entries(projects as Record<string, unknown>))
      groups.push({ where: basename(path), servers: (p as Record<string, unknown> | undefined)?.mcpServers })
  const seen = new Map<string, string>()
  for (const g of groups) {
    if (!g.servers || typeof g.servers !== 'object') continue
    for (const [name, v] of Object.entries(g.servers as Record<string, unknown>)) {
      const raw = claudeServer(v)
      if (!raw) continue
      const sig = JSON.stringify([raw.command, raw.args, raw.url])
      if (seen.get(name) === sig) continue
      // Cùng tên nhưng khác cấu hình (khác dự án): giữ cả hai, thêm tên dự án để phân biệt.
      const label = seen.has(name) && g.where ? `${name} (${g.where})` : name
      seen.set(name, sig)
      const r = candidateOf('claude-code', label, raw, env)
      if (r.candidate) out.candidates.push(r.candidate)
      if (r.skipped) out.skipped.push(r.skipped)
    }
  }
  return out
}

// --- Codex (TOML) -------------------------------------------------------------------------------------------

type Toml = string | number | boolean | Toml[] | { [k: string]: Toml }

/** Tách `a.b."c.d"` thành các đoạn, bỏ ngoặc kép. */
function tomlPath(s: string): string[] {
  const parts: string[] = []
  const re = /\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*(?:\.|$)/y
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) && m[0]) parts.push(m[1] ?? m[2] ?? m[3]!)
  return parts
}

/** Đọc một giá trị TOML ở đầu `s`; trả giá trị và phần còn lại. Hỗ trợ chuỗi, số, bool, mảng, bảng một dòng. */
function tomlValue(s: string): [Toml, string] | undefined {
  s = s.trimStart()
  if (s.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"/.exec(s)
    if (!m) return undefined
    const v = m[1]!.replace(/\\(["\\ntr])/g, (_, c: string) => ({ n: '\n', t: '\t', r: '\r' })[c] ?? c)
    return [v, s.slice(m[0].length)]
  }
  if (s.startsWith("'")) {
    const m = /^'([^']*)'/.exec(s)
    return m ? [m[1]!, s.slice(m[0].length)] : undefined
  }
  if (s.startsWith('[')) {
    const arr: Toml[] = []
    let rest = s.slice(1)
    for (;;) {
      rest = rest.replace(/^[\s,]+/, '')
      if (rest.startsWith(']')) return [arr, rest.slice(1)]
      const v = tomlValue(rest)
      if (!v) return undefined
      arr.push(v[0])
      rest = v[1]
    }
  }
  if (s.startsWith('{')) {
    const obj: { [k: string]: Toml } = {}
    let rest = s.slice(1)
    for (;;) {
      rest = rest.replace(/^[\s,]+/, '')
      if (rest.startsWith('}')) return [obj, rest.slice(1)]
      const m = /^(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*=\s*/.exec(rest)
      if (!m) return undefined
      const v = tomlValue(rest.slice(m[0].length))
      if (!v) return undefined
      obj[m[1] ?? m[2] ?? m[3]!] = v[0]
      rest = v[1]
    }
  }
  const m = /^(true|false|[+-]?\d[\d_]*(?:\.\d+)?)/.exec(s)
  if (!m) return undefined
  const t = m[1]!
  return [t === 'true' ? true : t === 'false' ? false : Number(t.replace(/_/g, '')), s.slice(t.length)]
}

/** Bỏ chú thích `#` ngoài chuỗi. */
function stripComment(line: string): string {
  let q = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (q) {
      if (c === '\\' && q === '"') i++
      else if (c === q) q = ''
    } else if (c === '"' || c === "'") q = c
    else if (c === '#') return line.slice(0, i)
  }
  return line
}

/** Đọc TOML đủ cho `config.toml` của Codex: bảng, bảng lồng, chuỗi, số, bool, mảng (nhiều dòng), bảng một dòng. */
export function parseToml(text: string): { [k: string]: Toml } {
  const root: { [k: string]: Toml } = {}
  let cur = root
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]!).trim()
    if (!line) continue
    const head = /^\[\s*([^[\]]+?)\s*\]$/.exec(line)
    if (head && !line.startsWith('[[')) {
      cur = root
      for (const seg of tomlPath(head[1]!)) {
        const next = cur[seg]
        cur = cur[seg] = next && typeof next === 'object' && !Array.isArray(next) ? next : {}
      }
      continue
    }
    if (line.startsWith('[[')) {
      // Mảng bảng: không dùng trong phần máy chủ MCP, bỏ qua cho tới bảng kế.
      cur = {}
      continue
    }
    const eq = /^(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_.-]+))\s*=\s*(.*)$/.exec(line)
    if (!eq) continue
    let valueText = eq[4]!
    // Mảng hay bảng nhiều dòng: ghép tới khi cân ngoặc.
    const depth = (t: string) => (t.match(/[[{]/g)?.length ?? 0) - (t.match(/[\]}]/g)?.length ?? 0)
    while (depth(valueText) > 0 && i + 1 < lines.length) valueText += ' ' + stripComment(lines[++i]!).trim()
    const v = tomlValue(valueText)
    if (v) cur[eq[1] ?? eq[2] ?? eq[3]!] = v[0]
  }
  return root
}

/** Máy chủ trong bảng `[mcp_servers.<tên>]` của `config.toml`. */
export function parseCodexConfig(text: string, env: NodeJS.ProcessEnv = process.env): ImportScan {
  const out: ImportScan = { candidates: [], skipped: [] }
  const servers = parseToml(text).mcp_servers
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return out
  for (const [name, v] of Object.entries(servers)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue
    const o = v as Record<string, unknown>
    const raw: RawServer = {
      ...(str(o.command) ? { command: str(o.command)! } : {}),
      args: strList(o.args),
      ...(str(o.url) ? { url: str(o.url)! } : {}),
      env: strMap(o.env),
      headers: strMap(o.http_headers),
      ...(str(o.bearer_token_env_var) ? { bearerEnvVar: str(o.bearer_token_env_var)! } : {}),
      disabled: o.enabled === false,
      ...(str(o.cwd) ? { cwd: str(o.cwd)! } : {}),
    }
    const r = candidateOf('codex', name, raw, env)
    if (r.candidate) out.candidates.push(r.candidate)
    if (r.skipped) out.skipped.push(r.skipped)
  }
  return out
}

/** Đọc cấu hình của cả hai công cụ trên máy. Tệp không có thì bỏ qua, tệp hỏng thì ghi vào `skipped`. */
export async function discoverMcp(
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<ImportScan> {
  const out: ImportScan = { candidates: [], skipped: [] }
  const read = async (path: string) => readFile(path, 'utf8').catch(() => undefined)
  for (const file of [join(home, '.claude.json'), join(home, '.claude', 'settings.json')]) {
    const text = await read(file)
    if (!text) continue
    try {
      const scan = parseClaudeConfig(JSON.parse(text), env)
      for (const c of scan.candidates)
        if (!out.candidates.some((x) => x.key === c.key)) out.candidates.push(c)
      out.skipped.push(...scan.skipped)
    } catch {
      out.skipped.push({
        source: 'claude-code',
        name: basename(file),
        reason: 'Không đọc được tệp cấu hình.',
      })
    }
  }
  const codex = await read(join(home, '.codex', 'config.toml'))
  if (codex) {
    const scan = parseCodexConfig(codex, env)
    out.candidates.push(...scan.candidates)
    out.skipped.push(...scan.skipped)
  }
  return out
}

/** Máy chủ này đã có trong aris chưa (cùng lệnh và tham số, hay cùng địa chỉ). */
export function sameServer(c: ImportCandidate, r: McpRecord): boolean {
  if (c.transport !== r.transport) return false
  if (c.transport === 'streamable-http') return c.url === r.url
  return c.command === r.command && JSON.stringify(c.args ?? []) === JSON.stringify(r.args ?? [])
}

/** Dữ liệu tạo kết nối `custom` từ một máy chủ đã chọn. Lệnh một dòng, tham số có khoảng trắng đặt trong ngoặc kép. */
export function candidateInput(c: ImportCandidate, ask: McpInput['ask'] = 'write'): McpInput {
  const base = { preset: 'custom' as const, name: c.name, transport: c.transport, secrets: c.secrets, ask }
  if (c.transport === 'streamable-http') return { ...base, url: c.url ?? '' }
  const quote = (x: string) => (/\s/.test(x) ? `"${x}"` : x)
  return { ...base, command: [c.command ?? '', ...(c.args ?? [])].map(quote).join(' ') }
}
