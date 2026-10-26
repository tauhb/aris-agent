/**
 * Nhập skill từ ngoài (giai đoạn 8, plan 8.1): phần thuần. Đọc đường dẫn GitHub, đọc `SKILL.md` của Claude Code và
 * Codex, đổi sang skill của aris, tìm thư mục skill trong một cây tệp, chọn tệp kèm, và bộ quét dấu hiệu nguy hiểm
 * (`scanImported`). Phần đọc mạng và đĩa nằm ở `import-io.ts`.
 */
import { parseCommands, recursiveRm, keychainRead, positionals } from '@aris/shell'
import { parse as parseYaml } from 'yaml'
import { fold, skillName } from './lint.js'

// --- Đường dẫn GitHub ----------------------------------------------------------------------------------------

export interface GithubRef {
  owner: string
  repo: string
  /** Nhánh, tag hay mã commit; không có là nhánh mặc định. */
  ref?: string | undefined
  /** Thư mục (hay đường tới `SKILL.md`) trong repo, không có dấu `/` ở đầu. */
  path?: string | undefined
}

const NAME_PART = /^[A-Za-z0-9._-]+$/

/**
 * Đọc đường dẫn GitHub: `github.com/chủ/repo`, `.../tree/<ref>/<thư mục>`, `.../blob/<ref>/<đường>/SKILL.md`.
 * `ref` là đoạn đầu sau `tree` hay `blob`, nên nhánh có dấu `/` trong tên chưa hỗ trợ (dùng tag hay mã commit).
 */
export function parseGithubUrl(input: string): GithubRef | undefined {
  let s = input.trim()
  if (!s) return undefined
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return undefined
  }
  if (u.protocol !== 'https:' || !/^(www\.)?github\.com$/i.test(u.hostname)) return undefined
  const seg = u.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (seg.length < 2) return undefined
  const owner = seg[0]!
  const repo = seg[1]!.replace(/\.git$/i, '')
  if (!NAME_PART.test(owner) || !NAME_PART.test(repo) || owner === '.' || repo === '.') return undefined
  const out: GithubRef = { owner, repo }
  if (seg.length === 2) return out
  const kind = seg[2]
  if (kind !== 'tree' && kind !== 'blob') return undefined
  const ref = seg[3]
  if (!ref) return undefined
  if (seg.slice(3).some((x) => x === '..' || x === '.')) return undefined
  let path = seg.slice(4)
  if (kind === 'blob') {
    // Đường tới một tệp: lấy thư mục chứa nó (SKILL.md) làm thư mục skill.
    if (!/^skill\.md$/i.test(path.at(-1) ?? '')) return undefined
    path = path.slice(0, -1)
  }
  return { ...out, ref, ...(path.length ? { path: path.join('/') } : {}) }
}

// --- SKILL.md --------------------------------------------------------------------------------------------------

export interface ParsedSkillMd {
  meta: Record<string, unknown>
  body: string
  /** Frontmatter có nhưng không đọc được. */
  badFrontmatter: boolean
}

/** Tách frontmatter YAML (`---` … `---`) và thân Markdown. Không có frontmatter thì cả tệp là thân. */
export function parseSkillMd(text: string): ParsedSkillMd {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src)
  if (!m) return { meta: {}, body: src.trim(), badFrontmatter: false }
  const body = src.slice(m[0].length).trim()
  try {
    const meta = parseYaml(m[1]!) as unknown
    if (meta && typeof meta === 'object' && !Array.isArray(meta))
      return { meta: meta as Record<string, unknown>, body, badFrontmatter: false }
    return { meta: {}, body, badFrontmatter: true }
  } catch {
    return { meta: {}, body, badFrontmatter: true }
  }
}

/** Đoạn "Use when…" / "Dùng khi…" trong mô tả: lúc nào nên dùng skill. */
const WHEN_RE =
  /(?:^|[.!?]\s+|\n)((?:use (?:this |it |the skill )?(?:skill )?(?:when|whenever|if)|dùng khi|sử dụng khi|trigger(?:s)? (?:when|on))\b[\s\S]*)$/i

export interface ImportDraft {
  name: string
  description: string
  whenToUse?: string | undefined
  body: string
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`)

/**
 * Đổi một `SKILL.md` đã đọc sang bản nháp skill của aris. Tên: `name` trong frontmatter, không có thì tên thư mục, đổi
 * thành chữ thường không dấu. Mô tả cắt còn 1.000 ký tự; đoạn "Use when…" tách thành `whenToUse`.
 */
export function toAris(p: ParsedSkillMd, dirName: string): ImportDraft {
  const metaName = typeof p.meta.name === 'string' ? p.meta.name : ''
  const name = skillName(metaName || dirName) || skillName(dirName) || 'skill-nhap'
  let desc = typeof p.meta.description === 'string' ? p.meta.description.replace(/\s+/g, ' ').trim() : ''
  if (!desc) {
    const first = p.body.split(/\n\s*\n/).find((x) => x.trim() && !x.trim().startsWith('#'))
    desc = (first ?? '').replace(/\s+/g, ' ').trim()
  }
  let whenToUse: string | undefined
  const w = WHEN_RE.exec(desc)
  // Vị trí của chính đoạn "Use when…" (phần khớp còn gồm dấu câu và khoảng trắng đứng trước).
  const at = w ? w.index + w[0].length - w[1]!.length : -1
  if (w && at > 0 && desc.slice(0, at).trim().length >= 20) {
    whenToUse = clip(w[1]!.trim(), 500)
    desc = desc.slice(0, at).trim()
  }
  return { name, description: clip(desc, 1000), ...(whenToUse ? { whenToUse } : {}), body: p.body }
}

// --- Tìm thư mục skill và chọn tệp kèm -----------------------------------------------------------------------

/** Tối đa ngần này cấp thư mục khi tìm `SKILL.md`. */
export const MAX_DEPTH = 5
const SKIP_DIRS = new Set(['node_modules', '.git'])

/**
 * Thư mục có `SKILL.md` trong một danh sách đường dẫn tương đối (dạng `a/b/SKILL.md`, dấu `/`), sâu tối đa
 * `MAX_DEPTH` cấp, bỏ `node_modules` và `.git`. Trả đường dẫn thư mục (`''` là gốc).
 */
export function findSkillDirs(paths: readonly string[]): string[] {
  const dirs = new Set<string>()
  for (const p of paths) {
    const parts = p.split('/')
    if (!/^skill\.md$/i.test(parts.at(-1) ?? '')) continue
    const dir = parts.slice(0, -1)
    if (dir.length > MAX_DEPTH || dir.some((x) => SKIP_DIRS.has(x))) continue
    dirs.add(dir.join('/'))
  }
  return [...dirs].sort()
}

/** Phần mở rộng của tệp chữ được chép kèm. */
export const TEXT_EXT = new Set([
  'md',
  'txt',
  'json',
  'yaml',
  'yml',
  'csv',
  'py',
  'sh',
  'js',
  'ts',
  'html',
  'css',
])
export const MAX_FILE_BYTES = 200 * 1024
export const MAX_FILES_BYTES = 2 * 1024 * 1024

export interface FileEntry {
  /** Đường tương đối trong thư mục skill. */
  path: string
  size: number
}

export interface FileChoice {
  keep: string[]
  dropped: { path: string; reason: 'binary' | 'big' | 'total' }[]
}

/** Chọn tệp kèm: chỉ tệp chữ, mỗi tệp tối đa 200 KB, tổng tối đa 2 MB; `SKILL.md` không tính là tệp kèm. */
export function chooseFiles(files: readonly FileEntry[]): FileChoice {
  const out: FileChoice = { keep: [], dropped: [] }
  let total = 0
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (/^skill\.md$/i.test(f.path)) continue
    const ext = (f.path.split('.').pop() ?? '').toLowerCase()
    if (!f.path.includes('.') || !TEXT_EXT.has(ext)) out.dropped.push({ path: f.path, reason: 'binary' })
    else if (f.size > MAX_FILE_BYTES) out.dropped.push({ path: f.path, reason: 'big' })
    else if (total + f.size > MAX_FILES_BYTES) out.dropped.push({ path: f.path, reason: 'total' })
    else {
      total += f.size
      out.keep.push(f.path)
    }
  }
  return out
}

/** Mục "Tệp kèm" cuối thân skill: đường dẫn tuyệt đối để bot đọc khi cần. */
export function withFilesSection(body: string, dir: string, files: readonly string[]): string {
  if (files.length === 0) return body
  return `${body.trimEnd()}\n\n## Tệp kèm (đọc khi cần)\n\n${files.map((f) => `- ${dir}/${f}`).join('\n')}\n`
}

// --- Bộ quét dấu hiệu nguy hiểm --------------------------------------------------------------------------------

/** Câu dụ dỗ model (đã bỏ dấu, viết thường). */
const INJECTION = [
  /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts?|rules)/,
  /disregard (all |any |the )?(previous|prior|above|earlier) (instructions|prompts?|rules)/,
  /forget (all |your )?(previous|prior) (instructions|rules)/,
  /(do not|don'?t|never) (tell|inform|reveal to|let) the user/,
  /without (telling|informing|notifying) the user/,
  /bo qua (moi|tat ca|cac) (huong dan|chi dan|quy tac)/,
  /(dung|khong) (noi|bao) (voi|cho) nguoi dung/,
  /you are now (in )?(developer|dan|jailbreak|unrestricted)/,
]

const SECRET_PATH =
  /(^|[\s"'=/])(~|\$home|\/users\/[^/\s]+|\/home\/[^/\s]+)?\/?\.(ssh|aws|gnupg|netrc|kube|docker)(\/|\b)|credentials\.ya?ml|id_(rsa|ed25519|ecdsa)\b|\.npmrc|\.pypirc|security (find|dump)-(generic|internet)-password/i
const READ_OR_SEND = new Set([
  'cat',
  'cp',
  'scp',
  'rsync',
  'curl',
  'wget',
  'tar',
  'zip',
  'base64',
  'nc',
  'ncat',
  'openssl',
  'head',
  'tail',
  'less',
  'more',
  'xxd',
  'od',
  'sftp',
  'security',
])
/** Thư mục nhà giả khi phân tích lệnh: `~` và `$HOME` thành đúng đường này, nên nhận ra được "xoá cả thư mục nhà". */
const SCAN_HOME = '/Users/_'
const SHELL_LANGS = /^(?:bash|sh|shell|zsh|console|terminal|shellscript|bat|cmd)?$/i

/** Các khối mã (```…```) của thân bài, kèm ngôn ngữ. */
export function codeBlocks(body: string): { lang: string; code: string }[] {
  const out: { lang: string; code: string }[] = []
  const re = /^[ \t]*(`{3,}|~{3,})[ \t]*([\w+-]*)[^\n]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm
  for (let m = re.exec(body); m; m = re.exec(body)) out.push({ lang: m[2] ?? '', code: m[3] ?? '' })
  return out
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** Nơi gửi dữ liệu mà không phải là cảnh báo: máy này và tên ví dụ trong tài liệu. */
const BENIGN_HOST =
  /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|example\.(com|org|net)|.*\.example\.(com|org|net)|.*\.test|.*\.local)$/i

/**
 * Quét thân skill và tệp kèm tìm dấu hiệu nguy hiểm; mỗi dấu hiệu là một câu có lý do. Lệnh trong khối mã được phân
 * tích bằng `@aris/shell`; ví dụ trong tài liệu (chữ "curl" mà không nằm trong lệnh) không bị báo.
 */
export function scanImported(body: string, extra: readonly { path: string; text: string }[] = []): string[] {
  const risks = new Set<string>()
  const docs = [{ where: 'SKILL.md', text: body }, ...extra.map((e) => ({ where: e.path, text: e.text }))]
  for (const d of docs) {
    const at = d.where === 'SKILL.md' ? '' : ` (${d.where})`
    const f = fold(d.text)
    for (const re of INJECTION)
      if (re.test(f)) risks.add(`Có câu dụ dỗ model bỏ qua hướng dẫn hay giấu người dùng${at}.`)
    // Shell: khối mã của thân bài; tệp kèm là script thì quét cả tệp.
    const isShellFile = /\.(sh|bash|zsh)$/i.test(d.where)
    const blocks = isShellFile
      ? [{ lang: 'sh', code: d.text }]
      : codeBlocks(d.text).filter((b) => SHELL_LANGS.test(b.lang))
    for (const b of blocks) scanShell(b.code, at, risks)
  }
  return [...risks]
}

function scanShell(code: string, at: string, risks: Set<string>) {
  const text = code.replace(/\\\n/g, ' ').replace(/^\s*[$#]\s+/gm, '')
  // Tải rồi chạy, giải mã rồi chạy: nhìn cả đoạn vì đường ống nằm giữa hai lệnh.
  if (
    /\b(curl|wget)\b[^\n|;&]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/i.test(text) ||
    /\b(curl|wget)\b[^\n|;&]*\|\s*(sudo\s+)?python3?\b/i.test(text)
  )
    risks.add(`Tải mã từ mạng rồi chạy ngay (curl hay wget nối vào sh)${at}.`)
  if (
    /\beval\s+["'`]?\$\(\s*(curl|wget)\b/i.test(text) ||
    /\b(sh|bash|zsh)\s+-c\s+["']?\$\(\s*(curl|wget)\b/i.test(text)
  )
    risks.add(`Tải mã từ mạng rồi chạy bằng eval hay sh -c${at}.`)
  if (
    /\bbase64\s+(-d|--decode|-D)\b[^\n]*\|\s*(sudo\s+)?(ba|z)?sh\b/i.test(text) ||
    /\beval\b[^\n]*\bbase64\b/i.test(text)
  )
    risks.add(`Giải mã base64 rồi chạy${at}.`)
  let parsed
  try {
    parsed = parseCommands(text, { home: SCAN_HOME })
  } catch {
    return
  }
  for (const c of parsed.cmds) {
    if (c.elevated) risks.add(`Chạy lệnh với quyền quản trị (sudo)${at}.`)
    if (recursiveRm(c)) {
      const target = positionals(c.args).some(
        (w) =>
          w.dyn ||
          /^(\/|\/\*|\*|\.\*)$/.test(w.v) ||
          w.v === SCAN_HOME ||
          (w.v.startsWith(`${SCAN_HOME}/`) && /^\*?$/.test(w.v.slice(SCAN_HOME.length + 1))),
      )
      if (target) risks.add(`Xoá đệ quy một thư mục rộng (gốc, thư mục nhà hay đích không rõ)${at}.`)
    }
    if (
      c.name === 'chmod' &&
      c.args.some((a) => a.v === '-R' || a.v === '--recursive') &&
      c.args.some((a) => /^(\/|~)$/.test(a.v))
    )
      risks.add(`Đổi quyền hàng loạt trên thư mục gốc hay thư mục nhà${at}.`)
    if (keychainRead(c)) risks.add(`Đọc mật khẩu trong Keychain${at}.`)
    if (READ_OR_SEND.has(c.name) && c.args.some((a) => SECRET_PATH.test(a.v)))
      risks.add(`Đọc hay gửi tệp bí mật (khoá SSH, AWS, Keychain, credentials)${at}.`)
    // Gửi dữ liệu ra ngoài: curl với dữ liệu đi kèm tới địa chỉ lạ.
    if (c.name === 'curl' || c.name === 'wget') {
      const sends =
        c.args.some((a) =>
          /^(-d|--data(-raw|-binary|-urlencode)?|-F|--form|-T|--upload-file|--post-data|--post-file)$/.test(
            a.v,
          ),
        ) ||
        c.args.some(
          (a, i) => /^(-X|--request)$/.test(a.v) && /^(POST|PUT|PATCH)$/i.test(c.args[i + 1]?.v ?? ''),
        )
      const urls = c.args.filter((a) => /^https?:\/\//i.test(a.v))
      if (sends)
        for (const u of urls) {
          const host = hostOf(u.v)
          if (host && !BENIGN_HOST.test(host)) risks.add(`Gửi dữ liệu ra ngoài tới ${host}${at}.`)
        }
    }
    if ((c.name === 'nc' || c.name === 'ncat') && c.args.length > 0)
      risks.add(`Mở kết nối thô (nc) tới máy khác${at}.`)
  }
}
