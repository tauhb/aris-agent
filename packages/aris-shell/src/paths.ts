/**
 * Đường dẫn cấm cho mọi bot (đợt 7f, S3): khoá, mật khẩu, kho khoá, lịch sử shell, dữ liệu trình duyệt, log có
 * token, dữ liệu aris và dsh (đọc và ghi đều chặn); chỗ tự chạy khi đăng nhập (chỉ chặn ghi). Kèm so khớp glob.
 */
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Word } from './parse.js'

/** Đường (tính từ thư mục nhà) không bot nào được đọc hay ghi. */
export const HOME_PROTECTED = [
  '.ssh',
  '.aws',
  '.gnupg',
  '.aris',
  '.dsh',
  '.config/gh',
  '.npmrc',
  '.git-credentials',
  '.docker/config.json',
  '.kube',
  '.netrc',
  '.zsh_history',
  '.bash_history',
  'Library/Keychains',
  // Log của daemon có thể còn token đăng nhập web.
  'Library/Logs/aris',
  'Library/Application Support/Google/Chrome',
  'Library/Application Support/Firefox',
  'Library/Application Support/Arc',
  'Library/Application Support/BraveSoftware',
  'Library/Cookies',
  'Library/Safari',
]

/** Chỗ tự chạy khi đăng nhập hay khi mở shell (tính từ thư mục nhà): chỉ cấm ghi, đọc vẫn được. */
export const HOME_AUTORUN = [
  '.zshrc',
  '.zprofile',
  '.zshenv',
  '.zlogin',
  '.bashrc',
  '.bash_profile',
  '.bash_login',
  '.profile',
  '.config/fish',
  'Library/LaunchAgents',
]
/** Chỗ tự chạy tuyệt đối. */
export const ABS_AUTORUN = ['/Library/LaunchAgents', '/Library/LaunchDaemons']

/** Tên tệp cấm ở bất kỳ thư mục nào (dạng đại diện, để so với glob). */
const GENERIC_NAMES = [
  '.env',
  '.env.local',
  '.dsh-home',
  '.credentials.yaml',
  '.credentials.yml',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  '.netrc',
]

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')
const underHome = (list: string[]) => new RegExp(`^(${list.map(escRe).join('|')})(/|$)`, 'i')
const HOME_PROTECTED_RE = underHome(HOME_PROTECTED)
const HOME_AUTORUN_RE = underHome(HOME_AUTORUN)
const GENERIC_RE =
  /(^|\/)(\.env(?!\.(example|sample|template)\b)(\.[\w.-]+)?|\.dsh-home|\.credentials\.ya?ml|id_(rsa|ed25519|ecdsa)[^/]*|\.netrc)(\/|$)/i

const expandHome = (p: string, home: string) => p.replace(/^~(?=$|\/)/, home)

/** Đường dẫn nằm trong thư mục (bỏ dấu `~` đầu). */
export function insideDir(target: string, dir: string, home = homedir()): boolean {
  const t = expandHome(target, home)
  const rel = relative(resolve(dir), resolve(dir, t))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Đường tuyệt đối sau khi giải liên kết mềm. Phần chưa tồn tại thì giải phần cha có thật rồi nối đuôi lại; để
 * `link/moi.txt` với `link` trỏ ra ngoài thư mục không lọt qua.
 */
export function realResolve(p: string): string {
  const abs = resolve(p)
  const tail: string[] = []
  let cur = abs
  for (;;) {
    try {
      return join(realpathSync(cur), ...tail.reverse())
    } catch {
      const parent = dirname(cur)
      if (parent === cur) return abs
      tail.push(basename(cur))
      cur = parent
    }
  }
}

/** Khoá, mật khẩu, kho khoá, lịch sử shell, dữ liệu trình duyệt, log có token, dữ liệu và cấu hình của aris, dsh. */
export function protectedPath(p: string, home = homedir()): boolean {
  const abs = resolve(expandHome(p, home))
  const rel = relative(home, abs)
  if (rel && !rel.startsWith('..') && !isAbsolute(rel) && HOME_PROTECTED_RE.test(rel)) return true
  return GENERIC_RE.test(abs)
}

/** Chỗ tự chạy khi đăng nhập: ghi vào đây là cài mã chạy lần sau. Đọc vẫn được. */
export function autorunPath(p: string, home = homedir()): boolean {
  const abs = resolve(expandHome(p, home))
  const rel = relative(home, abs)
  if (rel && !rel.startsWith('..') && !isAbsolute(rel) && HOME_AUTORUN_RE.test(rel)) return true
  if (ABS_AUTORUN.some((d) => abs === d || abs.startsWith(`${d}/`))) return true
  return /(^|\/)\.git\/hooks(\/|$)/.test(abs)
}

// --- Glob -----------------------------------------------------------------------------------------

/** Biểu thức chính quy cho một thành phần glob (không có `/`). */
export function globRe(pat: string): RegExp {
  const build = (s: string): string => {
    let re = ''
    for (let i = 0; i < s.length; i++) {
      const c = s[i]!
      if (c === '\\') re += escRe(s[++i] ?? '\\')
      else if (c === '*') re += '[^/]*'
      else if (c === '?') re += '[^/]'
      else if (c === '[') {
        const j = s.indexOf(']', i + 2)
        if (j < 0) re += '\\['
        else {
          let cls = s.slice(i + 1, j).replace(/\\/g, '\\\\')
          if (cls.startsWith('!')) cls = `^${cls.slice(1)}`
          re += `[${cls}]`
          i = j
        }
      } else if (c === '{') {
        const j = s.indexOf('}', i)
        if (j < 0) re += '\\{'
        else {
          const body = s.slice(i + 1, j)
          re += body.includes(',') ? `(${body.split(',').map(build).join('|')})` : '.*'
          i = j
        }
      } else re += escRe(c)
    }
    return re
  }
  return new RegExp(`^${build(pat)}$`, 'i')
}

/** Số ký tự thường (không phải ký tự glob) của một thành phần glob. */
function literalCount(comp: string): number {
  let n = 0
  for (let i = 0; i < comp.length; i++) {
    const c = comp[i]!
    if (c === '\\') {
      n++
      i++
    } else if (!'*?[]{},'.includes(c)) n++
  }
  return n
}

/** Thành phần glob không so được với tên bắt đầu bằng `.` khi nó mở đầu bằng ký tự đại diện. */
const leadingWildcard = (comp: string) => /^[*?[]/.test(comp)
export const compHits = (comp: string, name: string) =>
  !(name.startsWith('.') && leadingWildcard(comp)) && globRe(comp).test(name)

/**
 * Glob tuyệt đối (`pat`) có thể khớp một đường cấm không. Phần đầu là chữ thường và khớp tên cấm thì chặn
 * (`~/.s*\/config` khớp `.ssh`, `.e*` khớp `.env`). Glob chỉ gồm ký tự đại diện (`.*`, `*`) không tính, để
 * `ls ~/.*` còn dùng được.
 */
export function patTouchesProtected(pat: string, home = homedir()): boolean {
  const comps = pat.split('/')
  const homeComps = home.split('/')
  const underHomeDir = homeComps.every((c, i) => (comps[i] ?? '').toLowerCase() === c.toLowerCase())
  if (underHomeDir) {
    const rest = comps.slice(homeComps.length)
    const last = rest[rest.length - 1] ?? ''
    for (const entry of HOME_PROTECTED) {
      const ec = entry.split('/')
      let ok = rest.length > 0
      for (let i = 0; ok && i < Math.min(rest.length, ec.length); i++) ok = compHits(rest[i]!, ec[i]!)
      if (!ok) continue
      if (rest.length > ec.length) return true
      if (literalCount(last) >= 2) return true
    }
  }
  for (const comp of comps) {
    if (!/(^|[^\\])[*?[{]/.test(comp) || literalCount(comp) < 2) continue
    if (GENERIC_NAMES.some((n) => compHits(comp, n))) return true
  }
  return false
}

// --- Từ của lệnh ------------------------------------------------------------------------------------

/** Dựng `Word` từ một chuỗi tham số công cụ (đường dẫn, glob). */
export function toWord(s: string): Word {
  const hasGlob = /(^|[^\\])[*?[]/.test(s)
  return { v: s, dyn: false, ...(hasGlob ? { pat: s } : {}) }
}

/** Các đường tuyệt đối có thể là đích của từ; rỗng khi không biết (biến, lệnh con). */
export function wordPaths(w: Word, cwd: string | null, home: string, base?: string): string[] {
  if (w.dyn) return []
  if (isAbsolute(w.v)) return [resolve(w.v)]
  if (cwd) return [resolve(cwd, w.v)]
  return [resolve(home, w.v), ...(base ? [resolve(base, w.v)] : [])]
}

/** Các mảnh của từ có thể mang đường dẫn: cả từ, phần sau `=`, `:`, `@` (`--file=x`, `HEAD:.env`, `f=@x`). */
function pieces(s: string): string[] {
  const out = [s]
  for (const p of s.split(/[=:@]/)) if (p && p !== s) out.push(p)
  return out
}

/** Từ của lệnh có chạm đường cấm không (kể cả glob, và đường tương đối sau `cd`). */
export function wordTouchesProtected(
  w: Word,
  cwd: string | null,
  home: string,
  base?: string,
  /** Thêm một mẫu đường cấm riêng của nơi gọi (ví dụ bộ quyền khách ACP). */
  extra?: RegExp,
): boolean {
  const vs = pieces(w.v)
  const ps = w.pat !== undefined ? pieces(w.pat) : []
  for (const piece of vs) {
    if (!/[./~]/.test(piece)) continue
    for (const abs of wordPaths({ v: piece, dyn: w.dyn }, cwd, home, base))
      if (protectedPath(abs, home) || extra?.test(abs)) return true
  }
  for (const piece of ps) {
    if (!/[./~]/.test(piece)) continue
    for (const abs of wordPaths({ v: piece, dyn: w.dyn }, cwd, home, base))
      if (patTouchesProtected(abs, home)) return true
  }
  return false
}
