/**
 * Hàng rào cho mọi bot (giai đoạn 7, đợt 7a; bản vẽ 6.4): danh sách cấm cứng áp cả khi người dùng đã duyệt, việc
 * rủi ro thấp được tự cho khi chọn chế độ đó, trần cả đội. Thuần (trừ việc giải liên kết mềm bằng `realpath`).
 *
 * Từ đợt 7f lệnh shell được chuẩn hoá trước khi soi (`@aris/shell`: bỏ nháy, `\`, thay `$HOME`, bóc `bash -c`, `sudo`,
 * `xargs`…, tách theo `;`, `&`, xuống dòng…, theo dõi `cd`). Hàng rào vẫn chỉ bắt được các cách viết hay gặp, không
 * phải bộ cách ly: một lệnh cố tình che giấu (ghép tên lệnh từ biến, script dài) vẫn có thể lọt.
 */
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'
import {
  autorunPath,
  findDeletesOutside,
  forcePush,
  insideDir,
  keychainRead,
  parseCommands,
  printsLoginUrl,
  protectedPath,
  readOnlyCommand,
  realResolve,
  redirectTargets,
  rmOutside,
  scriptDeletes,
  toWord,
  wordPaths,
  wordTouchesProtected,
  writeTargets,
} from '@aris/shell'

export { autorunPath, insideDir, protectedPath }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const argsOf = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
const SHELL_TOOLS = new Set(['bash', 'pwsh', 'terminal_send', 'terminal_open'])
const expandHome = (p: string, home: string) => p.replace(/^~(?=$|\/)/, home)

export type HardVerdict = { what: string; reason: string } | undefined

const deny = (what: string): HardVerdict => ({
  what,
  reason: `Hàng rào của aris chặn: ${what} nằm trong danh sách cấm cứng của người dùng (áp cả khi đã duyệt). Đừng tìm cách khác để làm; báo người dùng nếu việc này thật sự cần.`,
})

/** Lệnh shell trong danh sách cấm cứng. */
function shellVerdict(cmd: string, cwd: string | undefined, home: string): HardVerdict {
  const parsed = parseCommands(cmd, { cwd, home })
  for (const c of parsed.cmds) {
    if (c.elevated) return deny('lệnh sudo')
    if (forcePush(c)) return deny('git push --force')
    if (keychainRead(c)) return deny('đọc khoá trong Keychain')
    if (printsLoginUrl(c)) return deny('in URL đăng nhập web của aris')
    if (rmOutside(c) || findDeletesOutside(c) || scriptDeletes(c, home))
      return deny('xoá đệ quy ngoài thư mục làm việc')
  }
  // Lưới an toàn trên chữ thô: nhắc thẳng tới thư mục khoá dù nằm trong chuỗi, heredoc.
  if (/(~|\$HOME|\$\{HOME\})\/(\.ssh|\.aws|\.gnupg|\.aris|\.dsh)\b/.test(cmd))
    return deny('đọc khoá, dữ liệu của aris')
  for (const c of parsed.cmds) {
    const words = [...c.args, ...c.redirs.flatMap((r) => (r.target ? [r.target] : []))]
    if (words.some((w) => wordTouchesProtected(w, c.cwd, home, c.base)))
      return deny('đọc khoá, mật khẩu, dữ liệu của aris')
    for (const w of [...writeTargets(c), ...redirectTargets(c)])
      if (wordPaths(w, c.cwd, home, c.base).some((p) => autorunPath(p, home)))
        return deny('ghi vào chỗ tự chạy (rc của shell, LaunchAgents, git hooks)')
  }
  return undefined
}

/**
 * Danh sách cấm cứng cho mọi bot, kể cả Aris: xoá đệ quy ngoài thư mục làm việc, `git push --force`, `sudo`, đọc
 * hay sửa khoá, mật khẩu, Keychain, dữ liệu và cấu hình của aris, ghi vào chỗ tự chạy, in URL đăng nhập web.
 */
export function hardVerdict(
  tool: string,
  rawArgs: unknown,
  cwd: string | undefined,
  home = homedir(),
): HardVerdict {
  const args = argsOf(rawArgs)
  if (SHELL_TOOLS.has(tool)) {
    const v = shellVerdict(str(args.command) || str(args.input) || str(args.text), cwd, home)
    if (v) return v
  }
  const writing =
    tool === 'write' || tool === 'edit' || (tool === 'str_replace_editor' && args.command !== 'view')
  const path =
    tool === 'write' || tool === 'edit' || tool === 'read' || tool === 'read_image'
      ? str(args.file_path)
      : tool === 'str_replace_editor'
        ? str(args.path)
        : tool === 'grep' || tool === 'glob'
          ? str(args.path)
          : ''
  if (path) {
    const p = expandHome(path, home)
    const abs = isAbsolute(p) || !cwd ? resolve(p) : resolve(cwd, p)
    // Giải liên kết mềm: `link/config` trỏ vào `~/.ssh` vẫn bị chặn.
    const real = realResolve(abs)
    if (protectedPath(abs, home) || protectedPath(real, home))
      return deny(writing ? 'sửa cấu hình, dữ liệu của aris, khoá' : 'đọc khoá, mật khẩu, dữ liệu của aris')
    if (writing && (autorunPath(abs, home) || autorunPath(real, home)))
      return deny('ghi vào chỗ tự chạy (rc của shell, LaunchAgents, git hooks)')
  }
  // Mẫu glob của `glob`, `grep` cũng không được nhắm vào đường cấm.
  const pattern = tool === 'glob' ? str(args.pattern) : tool === 'grep' ? str(args.glob) : ''
  if (pattern) {
    // Mẫu tương đối tính từ thư mục tìm (`path`), mặc định là thư mục làm việc.
    const from = path ? resolve(cwd ?? '/', expandHome(path, home)) : cwd
    const p = expandHome(pattern, home)
    const full = isAbsolute(p) || !from ? p : `${from}/${p}`
    if (wordTouchesProtected(toWord(full), cwd ?? null, home, cwd))
      return deny('đọc khoá, mật khẩu, dữ liệu của aris')
  }
  return undefined
}

/**
 * Công cụ một lượt "bị hạn chế" được gọi: lượt có tin của người không phải người dùng chính trên Telegram (thành
 * viên, khách). Chỉ công cụ đọc; mọi công cụ khác bị từ chối ở hàng rào, không chỉ là lời dặn trong prompt (đợt 7f,
 * S9). `memory` chỉ cho `search`, `list`.
 */
export const RESTRICTED_TOOLS: ReadonlySet<string> = new Set([
  'read',
  'grep',
  'glob',
  'brain_search',
  'brain_read',
  'web_search',
  'web_fetch',
  'memory',
])

/** Phán quyết cho lượt bị hạn chế; undefined là để luồng thường quyết. */
export function restrictedVerdict(tool: string, rawArgs: unknown): HardVerdict {
  const action = argsOf(rawArgs).action
  if (RESTRICTED_TOOLS.has(tool) && (tool !== 'memory' || action === 'search' || action === 'list'))
    return undefined
  const what = 'công cụ có tác động trong lượt của người không phải người dùng chính'
  return {
    what,
    reason: `Hàng rào của aris chặn: lượt này là tin của người không phải người dùng chính trên Telegram, nên chỉ được dùng công cụ đọc (đọc tệp, tìm, tra bộ não, tìm web). ${tool} không nằm trong số đó. Trả lời bằng chữ; đừng tìm cách khác để làm.`,
  }
}

/** Tên (thành phần đường dẫn) trong thư mục làm việc chạy lần sau khi cài, mở thư mục, commit: không tự cho ghi. */
const AUTORUN_NAMES = new Set([
  '.git',
  '.vscode',
  '.idea',
  '.husky',
  '.envrc',
  'package.json',
  'makefile',
  'gnumakefile',
])

/** Đường (tương đối với thư mục làm việc) trỏ vào tệp tự chạy lần sau. */
function selfRunning(rel: string): boolean {
  const comps = rel.toLowerCase().split('/')
  if (comps.some((c) => AUTORUN_NAMES.has(c) || c.startsWith('.env'))) return true
  const i = comps.indexOf('.github')
  return i >= 0 && comps[i + 1] === 'workflows'
}

/** Đường dẫn công cụ nằm trong thư mục làm việc (sau khi giải liên kết mềm) và không phải đường cấm. */
function insideSafely(p: string, cwd: string, home: string): string | undefined {
  const abs = resolve(cwd, expandHome(p, home))
  const real = realResolve(abs)
  const root = realResolve(cwd)
  if (!insideDir(real, root, home) || protectedPath(abs, home) || protectedPath(real, home)) return undefined
  return real
}

/**
 * Việc rủi ro thấp: đọc trong thư mục làm việc, lệnh chỉ đọc (`readOnlyCommand`), ghi trong thư mục làm việc trừ
 * tệp tự chạy lần sau. Mạng, gửi tin, đọc hay ghi ngoài thư mục: không.
 */
export function lowRisk(tool: string, rawArgs: unknown, cwd: string | undefined, home = homedir()): boolean {
  const args = argsOf(rawArgs)
  if (SHELL_TOOLS.has(tool)) return readOnlyCommand(str(args.command) || str(args.input), { cwd, home })
  const isView = tool === 'str_replace_editor' && args.command === 'view'
  if (tool === 'read' || tool === 'read_image' || tool === 'grep' || tool === 'glob' || isView) {
    if (!cwd) return false
    const p = tool === 'read' || tool === 'read_image' ? str(args.file_path) : str(args.path)
    if ((tool === 'read' || tool === 'read_image' || isView) && !p) return false
    if (p && !insideSafely(p, cwd, home)) return false
    // Mẫu glob tuyệt đối hay đi lên (`/Users/x/.ssh/*`, `../*`) cũng phải nằm trong thư mục làm việc.
    const pat = tool === 'glob' ? str(args.pattern) : tool === 'grep' ? str(args.glob) : ''
    if (pat && (isAbsolute(expandHome(pat, home)) || pat.split('/').includes('..'))) {
      if (!insideDir(expandHome(pat, home), cwd, home)) return false
    }
    return !pat || !wordTouchesProtected(toWord(pat), cwd, home, cwd)
  }
  const w =
    tool === 'write' || tool === 'edit'
      ? str(args.file_path)
      : tool === 'str_replace_editor'
        ? str(args.path)
        : ''
  if (!w || !cwd) return false
  const real = insideSafely(w, cwd, home)
  if (!real) return false
  const abs = resolve(cwd, expandHome(w, home))
  return !autorunPath(abs, home) && !autorunPath(real, home) && !selfRunning(relative(realResolve(cwd), real))
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
