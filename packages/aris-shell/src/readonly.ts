/**
 * Lệnh shell chỉ đọc (đợt 7f, S1, S10): dùng cho chế độ "Tự cho việc rủi ro thấp" của `@aris/guard` và hộp cát kiểm
 * thử skill của `@aris/skills`. Một lệnh chỉ đọc khi mọi đoạn (tách cả theo `&` đơn và xuống dòng) đều là lệnh trong
 * danh sách, không có cờ biến nó thành ghi hay chạy chương trình khác, không chuyển hướng ghi.
 */
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import { positionals, redirectTargets } from './ops.js'
import { insideDir, realResolve, wordPaths, wordTouchesProtected } from './paths.js'
import { parseCommands, type Cmd, type Word } from './parse.js'

export interface ReadOnlyOptions {
  /** Thư mục làm việc. Chế độ chặt đòi có, và chỉ cho đọc trong đó. */
  cwd?: string | undefined
  home?: string
  /**
   * Chế độ nới cho hộp cát kiểm thử (đã có `hardVerdict` và hộp cát chặn mọi ghi): cho đọc ngoài thư mục làm việc,
   * `cd`, gán biến, `echo`, `$VAR`, `xargs` và `find -exec` chạy tiếp một lệnh đọc. Chế độ chặt (mặc định) cho việc
   * tự cho khi không hỏi người dùng.
   */
  lenient?: boolean
}

/** Lệnh `xargs` và `find -exec` được chạy tiếp (chế độ nới). */
const READ_TAIL = new Set([
  'cat',
  'wc',
  'head',
  'tail',
  'grep',
  'rg',
  'ls',
  'stat',
  'file',
  'du',
  'sort',
  'uniq',
])

const isFlag = (w: Word) => w.v.startsWith('-') && w.v.length > 1

function findOk(args: Word[], lenient: boolean): boolean {
  for (let i = 0; i < args.length; i++) {
    const v = args[i]!.v
    if (/^-(delete|ok|okdir|fprint\w*|fls)$/.test(v)) return false
    if (v === '-exec' || v === '-execdir') {
      if (!lenient) return false
      const tail: Word[] = []
      let j = i + 1
      while (j < args.length && args[j]!.v !== ';' && args[j]!.v !== '+') tail.push(args[j++]!)
      const name = (tail[0]?.v ?? '').split('/').pop()?.toLowerCase() ?? ''
      if (!READ_TAIL.has(name) || !argsOk(name, tail.slice(1), true)) return false
      i = j
    }
  }
  return true
}

const GIT_READ = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files'])
const BRANCH_FLAGS = new Set([
  '-a',
  '-r',
  '-v',
  '-vv',
  '--list',
  '--show-current',
  '--all',
  '--remotes',
  '--verbose',
])

function gitOk(args: Word[], lenient: boolean): boolean {
  let i = 0
  while (i < args.length) {
    const a = args[i]!.v
    if (a === '-C') i += 2
    else if (a === '--no-pager' || a === '-P' || a === '--no-optional-locks') i++
    else if (a.startsWith('-')) return false
    else break
  }
  const sub = args[i]?.v
  const rest = args.slice(i + 1)
  if (
    rest.some((a) => /^--(output|ext-diff|open-files-in-pager|exec-path|upload-pack|receive-pack)/.test(a.v))
  )
    return false
  if (sub === undefined) return false
  if (GIT_READ.has(sub) || (lenient && sub === 'blame')) return true
  if (sub === 'branch') {
    if (!rest.filter(isFlag).every((a) => BRANCH_FLAGS.has(a.v))) return false
    return positionals(rest).length === 0 || rest.some((a) => a.v === '--list')
  }
  if (sub === 'remote') return rest.every((a) => a.v === '-v' || a.v === '--verbose')
  return false
}

/** Chỉ các đối số của lệnh; `name` đã chuẩn hoá. */
function argsOk(name: string, args: Word[], lenient: boolean): boolean {
  const vs = args.map((a) => a.v)
  const has = (re: RegExp) => vs.some((v) => re.test(v))
  switch (name) {
    case 'ls':
    case 'pwd':
    case 'cat':
    case 'head':
    case 'tail':
    case 'wc':
    case 'grep':
    case 'egrep':
    case 'fgrep':
    case 'stat':
    case 'df':
    case 'which':
      return true
    case 'file':
      return !has(/^-[a-zA-Z]*C|^--compile$/)
    case 'du':
      return !has(/^--files0-from/)
    case 'tree':
      return !has(/^-[a-zA-Z]*o|^--output|^--fromfile/)
    case 'sort':
      return !has(/^-[a-zA-Z]*o|^--output|^--compress-program|^-T$|^--temporary-directory/)
    case 'uniq':
      return positionals(args).length <= 1
    case 'rg':
      return !has(/^--pre(-glob)?(=|$)|^--hostname-bin/)
    case 'date':
      return !has(/^-[a-zA-Z]*s|^--set/) && positionals(args).every((a) => a.v.startsWith('+'))
    case 'find':
      return findOk(args, lenient)
    case 'git':
      return gitOk(args, lenient)
    case 'node':
    case 'python':
    case 'python3':
      return vs.length === 1 && ['--version', '-v', '-V'].includes(vs[0]!)
    case 'npm':
      return vs[0] === 'ls' || vs[0] === 'view'
    case 'pnpm':
      return vs[0] === 'ls' || vs[0] === 'why'
    case 'echo':
      return lenient
    case 'cd':
      return lenient && positionals(args).length <= 1
    case 'sed':
      // Chỉ `sed -n 'Np'` (in dòng): lệnh `w`, `e` của sed ghi hay chạy chương trình.
      return (
        lenient &&
        vs.includes('-n') &&
        vs.every((v) => v === '-n' || /^-[Er]$/.test(v) || !v.startsWith('-')) &&
        /^[0-9$,]*p$/.test(positionals(args)[0]?.v ?? '')
      )
    default:
      return false
  }
}

function pathOk(w: Word, c: Cmd, o: ReadOnlyOptions, home: string): boolean {
  if (wordTouchesProtected(w, c.cwd, home, c.base)) return false
  if (o.lenient) return true
  if (!o.cwd || w.dyn) return false
  // Cờ có `=`: chỉ xét phần giá trị. Cờ thường không phải đường dẫn.
  let word = w
  if (isFlag(w)) {
    const eq = w.v.indexOf('=')
    if (eq < 0) return true
    word = { v: w.v.slice(eq + 1), dyn: false }
  }
  const root = realResolve(o.cwd)
  return wordPaths(word, c.cwd, home, c.base).every((abs) => insideDir(realResolve(abs), root, home))
}

function cmdOk(c: Cmd, o: ReadOnlyOptions, home: string): boolean {
  const lenient = o.lenient === true
  if (c.elevated) return false
  if (c.assigns > 0 && !lenient) return false
  if (c.viaXargs && !lenient) return false
  if (redirectTargets(c).length > 0) return false
  for (const r of c.redirs) if (r.op.startsWith('<<')) return false
  if (!argsOk(c.name, c.args, lenient)) return false
  const words = [...c.args, ...c.redirs.filter((r) => r.op === '<' && r.target).map((r) => r.target!)]
  return words.every((w) => pathOk(w, c, o, home))
}

/** Lệnh shell chỉ đọc (xem đầu tệp). */
export function readOnlyCommand(command: string, o: ReadOnlyOptions = {}): boolean {
  const home = o.home ?? homedir()
  const text = command.trim()
  if (!text) return false
  if (!o.lenient && (!o.cwd || !isAbsolute(o.cwd) || /[`$]|<\(|>\(/.test(text))) return false
  const parsed = parseCommands(text, { cwd: o.cwd, home })
  if (parsed.opaque || parsed.cmds.length === 0) return false
  if (!o.lenient && parsed.assigns) return false
  return parsed.cmds.every((c) => cmdOk(c, o, home))
}
