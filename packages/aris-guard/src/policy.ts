/**
 * Hàng rào cho mọi bot (giai đoạn 7, đợt 7a; bản vẽ 6.4): danh sách cấm cứng áp cả khi người dùng đã duyệt, việc
 * rủi ro thấp được tự cho khi chọn chế độ đó, trần cả đội. Thuần.
 */
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const argsOf = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
const SHELL_TOOLS = new Set(['bash', 'pwsh', 'terminal_send', 'terminal_open'])

export function insideDir(target: string, dir: string, home = homedir()): boolean {
  const t = target.replace(/^~(?=$|\/)/, home)
  const rel = relative(resolve(dir), resolve(dir, t))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Khoá, mật khẩu, kho khoá, dữ liệu và cấu hình của aris, dsh. */
export function protectedPath(p: string, home = homedir()): boolean {
  const abs = resolve(p.replace(/^~(?=$|\/)/, home))
  const rel = relative(home, abs)
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
    if (/^(\.ssh|\.aws|\.gnupg|\.aris|\.dsh|\.config\/gh|Library\/Keychains)(\/|$)/.test(rel)) return true
  }
  return /(^|\/)(\.env(?!\.(example|sample|template)\b)(\.[\w.-]+)?|\.dsh-home|\.credentials\.ya?ml|id_(rsa|ed25519|ecdsa)[^/]*|\.netrc)(\/|$)/.test(
    abs,
  )
}

/** Các đường dẫn đứng sau `rm` trong một lệnh (bỏ cờ). */
function rmTargets(cmd: string): string[] {
  const out: string[] = []
  for (const part of cmd.split(/[;&|\n]+/)) {
    const words = part.trim().split(/\s+/)
    const i = words.findIndex((w) => /^(sudo\s+)?rm$/.test(w) || w === 'rm')
    if (i < 0) continue
    const rest = words.slice(i + 1)
    const recursive = rest.some((w) => /^-[a-zA-Z]*[rR]/.test(w) || w === '--recursive')
    if (!recursive) continue
    for (const w of rest) if (w && !w.startsWith('-')) out.push(w.replace(/^["']|["']$/g, ''))
  }
  return out
}

export type HardVerdict = { what: string; reason: string } | undefined

const deny = (what: string): HardVerdict => ({
  what,
  reason: `Hàng rào của aris chặn: ${what} nằm trong danh sách cấm cứng của người dùng (áp cả khi đã duyệt). Đừng tìm cách khác để làm; báo người dùng nếu việc này thật sự cần.`,
})

/**
 * Danh sách cấm cứng cho mọi bot, kể cả Aris: xoá đệ quy ngoài thư mục làm việc, `git push --force`, `sudo`, đọc
 * hay sửa khoá, mật khẩu, Keychain, dữ liệu và cấu hình của aris.
 */
export function hardVerdict(
  tool: string,
  rawArgs: unknown,
  cwd: string | undefined,
  home = homedir(),
): HardVerdict {
  const args = argsOf(rawArgs)
  if (SHELL_TOOLS.has(tool)) {
    const cmd = str(args.command) || str(args.input) || str(args.text)
    if (/(^|[\s;&|`(])sudo(\s|$)/.test(cmd)) return deny('lệnh sudo')
    if (/\bgit\s+push\b[^\n]*(\s--force(-with-lease)?\b|\s-[a-zA-Z]*f\b)/.test(cmd))
      return deny('git push --force')
    if (/\bsecurity\s+(find-(generic|internet)-password|dump-keychain|export)\b/.test(cmd))
      return deny('đọc khoá trong Keychain')
    for (const t of rmTargets(cmd)) {
      if (t === '/' || t === '~' || t === '*' || /^\/\*?$/.test(t))
        return deny('xoá đệ quy ngoài thư mục làm việc')
      if (!cwd || !insideDir(t, cwd, home)) return deny('xoá đệ quy ngoài thư mục làm việc')
    }
    if (/(~|\$HOME)\/(\.ssh|\.aws|\.gnupg|\.aris|\.dsh)\b/.test(cmd))
      return deny('đọc khoá, dữ liệu của aris')
    for (const tok of cmd.split(/[\s'"=<>|;&()]+/))
      if (
        tok &&
        /[./~]/.test(tok) &&
        protectedPath(tok.startsWith('/') || tok.startsWith('~') || !cwd ? tok : resolve(cwd, tok), home)
      )
        return deny('đọc khoá, mật khẩu, dữ liệu của aris')
  }
  const path =
    tool === 'write' || tool === 'edit' || tool === 'read' || tool === 'read_image'
      ? str(args.file_path)
      : tool === 'str_replace_editor'
        ? str(args.path)
        : tool === 'grep' || tool === 'glob'
          ? str(args.path)
          : ''
  if (
    path &&
    protectedPath(path.startsWith('/') || path.startsWith('~') || !cwd ? path : resolve(cwd, path), home)
  )
    return deny(
      tool === 'write' || tool === 'edit'
        ? 'sửa cấu hình, dữ liệu của aris, khoá'
        : 'đọc khoá, mật khẩu, dữ liệu của aris',
    )
  return undefined
}

/** Lệnh shell chỉ đọc: tự cho được ở chế độ "Tự cho việc rủi ro thấp". */
const READ_ONLY =
  /^(ls|pwd|cat|head|tail|wc|grep|rg|find|tree|file|stat|du|df|echo|which|date|git\s+(status|log|diff|show|branch|remote|rev-parse|ls-files)|node\s+--version|npm\s+(ls|view)|pnpm\s+(ls|why))\b/

/** Việc rủi ro thấp: đọc, lệnh chỉ đọc, ghi trong thư mục làm việc. Mạng, gửi tin, ghi ngoài thư mục: không. */
export function lowRisk(tool: string, rawArgs: unknown, cwd: string | undefined, home = homedir()): boolean {
  const args = argsOf(rawArgs)
  if (SHELL_TOOLS.has(tool)) {
    const cmd = (str(args.command) || str(args.input)).trim()
    if (!cmd || /[>`$]|\$\(|\bsudo\b|-delete\b|-exec\b|\|\s*(sh|bash|zsh|xargs)\b/.test(cmd)) return false
    return cmd
      .split(/\s*(?:&&|\|\||;|\|)\s*/)
      .filter(Boolean)
      .every((part) => READ_ONLY.test(part))
  }
  if (tool === 'read' || tool === 'read_image' || tool === 'grep' || tool === 'glob') return true
  if (tool === 'str_replace_editor' && args.command === 'view') return true
  const w =
    tool === 'write' || tool === 'edit'
      ? str(args.file_path)
      : tool === 'str_replace_editor'
        ? str(args.path)
        : ''
  return !!w && !!cwd && insideDir(w, cwd, home) && !protectedPath(resolve(cwd, w), home)
}

export interface GuardSettings {
  /** Trần chi phí cả đội mỗi ngày (USD); 0 là không đặt. */
  teamCapUsd: number
  /** Báo qua Telegram khi chạm bấy nhiêu phần trăm trần. */
  warnPct: number
  /** Khi chạm trần cả đội: chỉ dừng việc nền, hay dừng hết. */
  capMode: 'bg' | 'all'
  /** Duyệt: hỏi người dùng mọi việc, hay tự cho việc rủi ro thấp. */
  mode: 'ask' | 'auto'
  /** Chờ duyệt quá bấy nhiêu phút thì từ chối; 0 là chờ mãi. */
  approvalMin: number
  stopped: boolean
  stoppedAt?: string | undefined
}

export const DEFAULT_GUARD: GuardSettings = {
  teamCapUsd: 5,
  warnPct: 80,
  capMode: 'bg',
  mode: 'ask',
  approvalMin: 30,
  stopped: false,
}

const num = (v: unknown, min: number, max: number, prev: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 100) / 100 : prev

/** Cài đặt từ dữ liệu gửi lên; giữ giá trị cũ cho trường không gửi hay sai. */
export function cleanGuard(input: unknown, prev: GuardSettings = DEFAULT_GUARD): GuardSettings {
  const r = argsOf(input)
  return {
    teamCapUsd: num(r.teamCapUsd, 0, 1000, prev.teamCapUsd),
    warnPct: Math.round(num(r.warnPct, 1, 100, prev.warnPct)),
    capMode: r.capMode === 'all' || r.capMode === 'bg' ? r.capMode : prev.capMode,
    mode: r.mode === 'auto' || r.mode === 'ask' ? r.mode : prev.mode,
    approvalMin: Math.round(num(r.approvalMin, 0, 24 * 60, prev.approvalMin)),
    stopped: prev.stopped,
    ...(prev.stoppedAt ? { stoppedAt: prev.stoppedAt } : {}),
  }
}

/** Mức báo đã vượt (ngưỡng, 100%) cho chi phí hiện tại; undefined khi chưa tới hay không đặt trần. */
export function warnLevel(
  spent: number,
  s: Pick<GuardSettings, 'teamCapUsd' | 'warnPct'>,
): 'nguong' | 'tran' | undefined {
  if (!(s.teamCapUsd > 0)) return undefined
  if (spent >= s.teamCapUsd) return 'tran'
  if (spent >= (s.teamCapUsd * s.warnPct) / 100) return 'nguong'
  return undefined
}
