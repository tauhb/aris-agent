/**
 * Chuẩn hoá một lệnh shell trước khi hàng rào soi (đợt 7f, S2, S3): bỏ nháy và dấu `\`, thay `~`, `$HOME`, `${HOME}`,
 * bóc `command`, `env`, `sudo`, `xargs`, `bash -c`, `eval`…, tách theo `;`, `&&`, `||`, `|`, `&`, xuống dòng, `(`,
 * `)`, lệnh con `$(…)`, dấu huyền, và theo dõi `cd` đơn giản. Thuần, không chạy gì.
 *
 * Đây không phải bộ phân tích shell đầy đủ: ai muốn lách thì lách được (ví dụ ghép tên lệnh từ biến). Mục đích là bắt
 * các cách viết hay gặp; chỗ không biết thì đánh dấu `dyn` hay `opaque` để nơi gọi coi là "không chắc" và chặn hay hỏi.
 */
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

/** Một từ của lệnh sau khi bỏ nháy và thay biến đã biết. */
export interface Word {
  v: string
  /** Còn biến chưa biết giá trị hay có lệnh con: không biết giá trị thật. */
  dyn: boolean
  /** Dạng glob: ký tự glob thật (không nháy) giữ nguyên, ký tự khác thoát bằng `\`. Chỉ có khi từ là glob. */
  pat?: string | undefined
}

export interface Redirect {
  /** `>`, `>>`, `>|`, `&>`, `&>>`, `<`, `<<`, `<<-`, `<<<`. */
  op: string
  /** Không có khi là nhân đôi luồng (`2>&1`). */
  target?: Word | undefined
  /** Nội dung heredoc. */
  body?: string | undefined
}

/** Một lệnh đơn đã bóc hết lớp bọc. */
export interface Cmd {
  /** Tên lệnh: chỉ phần cuối của đường dẫn, chữ thường (`/bin/rm`, `\rm`, `"RM"` đều thành `rm`). */
  name: string
  args: Word[]
  /** Thư mục lúc lệnh chạy sau khi theo dõi `cd`; null: không biết. */
  cwd: string | null
  /** Thư mục làm việc gốc của phiên (trước mọi `cd`); undefined: không biết. */
  base: string | undefined
  redirs: Redirect[]
  /** Tên lệnh còn biến hay lệnh con (`$(echo rm) -rf ~`): không biết lệnh thật là gì. */
  nameDyn: boolean
  /** Lệnh nâng quyền (`sudo`, `doas`, `su`, `pkexec`). */
  elevated: boolean
  /** Đối số còn lại đến từ stdin qua `xargs`: không biết đích. */
  viaXargs: boolean
  /** Số phép gán biến đứng trước lệnh (`A=1 ls`). */
  assigns: number
  heredoc?: string | undefined
}

export interface Parsed {
  cmds: Cmd[]
  /** Có lệnh con (`$(…)`, dấu huyền, `<(…)`), nháy không đóng, hay lồng quá sâu: không chắc chắn hết được. */
  opaque: boolean
  /** Có phép gán biến đứng riêng hay trước lệnh. */
  assigns: boolean
}

const PWD_MARK = ''
const MAX_DEPTH = 6
const RESERVED = new Set([
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'do',
  'done',
  'while',
  'until',
  '{',
  '}',
  '!',
  'esac',
])
/** Mở đầu một câu lệnh ta bỏ cả câu (không phải lệnh chạy). */
const DROP_STATEMENT = new Set(['for', 'select', 'case', 'function', 'coproc'])
const ELEVATE = new Set(['sudo', 'doas', 'su', 'pkexec'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'ash', 'fish'])
const PLAIN_WRAPPERS = new Set([
  'command',
  'builtin',
  'exec',
  'nohup',
  'time',
  'setsid',
  'noglob',
  'unbuffer',
])
const XARGS_VALUED = new Set(['-I', '-i', '-L', '-l', '-n', '-P', '-s', '-d', '-E', '-a', '-R', '-S'])

type Tok =
  | { k: 'w'; w: Word; subs: string[]; assign: boolean }
  | { k: 'op'; v: string }
  | { k: 'redir'; op: string; dup: boolean; body?: string | undefined }

const GLOB_META = /[*?[\]{}\\]/
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/

/** Tìm `)` khớp với `(` ở vị trí `open`; -1 khi không có. */
function matchParen(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') i++
    else if (c === "'") {
      const j = s.indexOf("'", i + 1)
      if (j < 0) return -1
      i = j
    } else if (c === '"') {
      i++
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\') i++
        i++
      }
    } else if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Giải `$'…'` (ANSI-C): `\xHH`, `\NNN`, `\n`…, để bắt `$'\x72m'`. */
function ansiC(body: string): string {
  return body.replace(
    /\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|[0-7]{1,3}|[abefnrtv\\'"])/g,
    (_m, e: string) => {
      if (e[0] === 'x' || e[0] === 'u') return String.fromCharCode(parseInt(e.slice(1), 16))
      if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8))
      const map: Record<string, string> = {
        a: '\x07',
        b: '\b',
        e: '\x1b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        v: '\v',
      }
      return map[e] ?? e
    },
  )
}

function lex(
  src: string,
  home: string,
  env: Map<string, string>,
): { toks: Tok[]; opaque: boolean; assigns: boolean } {
  const toks: Tok[] = []
  const heredocs: { idx: number; strip: boolean }[] = []
  let opaque = false
  let assigns = false
  let cmdStart = true
  let i = 0
  // Từ đang dựng.
  let v = ''
  let pat = ''
  let hasGlob = false
  let dyn = false
  let started = false
  let subs: string[] = []

  const lit = (ch: string) => {
    v += ch
    pat += GLOB_META.test(ch) ? `\\${ch}` : ch
    started = true
  }
  const litAll = (s: string) => {
    for (const ch of s) lit(ch)
  }
  const glob = (ch: string) => {
    v += ch
    pat += ch
    hasGlob = true
    started = true
  }
  const endWord = () => {
    if (!started) return
    const w: Word = { v, dyn, ...(hasGlob ? { pat } : {}) }
    const assign = cmdStart && ASSIGN.test(v) && !hasGlob
    if (assign) {
      assigns = true
      const eq = v.indexOf('=')
      if (!dyn) env.set(v.slice(0, eq), v.slice(eq + 1))
    }
    toks.push({ k: 'w', w, subs, assign })
    if (!assign) cmdStart = false
    v = ''
    pat = ''
    hasGlob = false
    dyn = false
    started = false
    subs = []
  }
  const op = (o: string) => {
    endWord()
    toks.push({ k: 'op', v: o })
    cmdStart = true
  }
  const variable = (name: string) => {
    if (name === 'HOME') litAll(home)
    else if (name === 'PWD') {
      v += PWD_MARK
      pat += PWD_MARK
      started = true
    } else if (env.has(name)) litAll(env.get(name) ?? '')
    else {
      dyn = true
      litAll(`$${name}`)
    }
  }
  /** Gặp `$` ở vị trí i (s[i] === '$'): xử lý, đưa i qua phần đã đọc. */
  const dollar = (inDq: boolean) => {
    const n = src[i + 1]
    if (n === '(') {
      const end = matchParen(src, i + 1)
      subs.push(src.slice(i + 2, end < 0 ? src.length : end))
      if (end < 0) opaque = true
      dyn = true
      started = true
      i = end < 0 ? src.length : end + 1
    } else if (n === '{') {
      const j = src.indexOf('}', i + 2)
      const name = j < 0 ? '' : src.slice(i + 2, j)
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) variable(name)
      else {
        dyn = true
        litAll(j < 0 ? src.slice(i) : src.slice(i, j + 1))
      }
      i = j < 0 ? src.length : j + 1
    } else if (n !== undefined && /[A-Za-z_]/.test(n)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i + 1))!
      variable(m[0])
      i += 1 + m[0].length
    } else if (n === "'" && !inDq) {
      let j = i + 2
      while (j < src.length && src[j] !== "'") j += src[j] === '\\' ? 2 : 1
      litAll(ansiC(src.slice(i + 2, j)))
      i = j + 1
    } else if (n === '"' && !inDq) {
      i++
    } else {
      dyn = true
      litAll(n === undefined ? '$' : `$${n}`)
      i += n === undefined ? 1 : 2
    }
  }
  const backtick = () => {
    let j = i + 1
    while (j < src.length && src[j] !== '`') j += src[j] === '\\' ? 2 : 1
    if (j >= src.length) opaque = true
    subs.push(src.slice(i + 1, j).replace(/\\`/g, '`'))
    dyn = true
    started = true
    i = j + 1
  }

  while (i < src.length) {
    const c = src[i]!
    if (c === ' ' || c === '\t' || c === '\r') {
      endWord()
      i++
    } else if (c === '\\') {
      if (src[i + 1] === '\n') i += 2
      else if (i + 1 < src.length) {
        lit(src[i + 1]!)
        i += 2
      } else i++
    } else if (c === '#' && !started) {
      while (i < src.length && src[i] !== '\n') i++
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1)
      if (j < 0) opaque = true
      started = true
      litAll(src.slice(i + 1, j < 0 ? src.length : j))
      i = j < 0 ? src.length : j + 1
    } else if (c === '"') {
      started = true
      i++
      let closed = false
      while (i < src.length) {
        const d = src[i]!
        if (d === '"') {
          closed = true
          i++
          break
        }
        if (d === '\\') {
          const e = src[i + 1]
          if (e === '\n') i += 2
          else if (e !== undefined && '$`"\\'.includes(e)) {
            lit(e)
            i += 2
          } else {
            lit('\\')
            i++
          }
        } else if (d === '$') dollar(true)
        else if (d === '`') backtick()
        else {
          lit(d)
          i++
        }
      }
      if (!closed) opaque = true
    } else if (c === '$') dollar(false)
    else if (c === '`') backtick()
    else if (c === '~' && !started) {
      const m = /^~([A-Za-z0-9_.-]*)/.exec(src.slice(i))!
      const rest = src[i + m[0].length]
      if (rest === undefined || /[\s/;&|()<>]/.test(rest)) {
        const user = m[1]!
        litAll(user ? join(dirname(home), user) : home)
        i += m[0].length
      } else {
        lit('~')
        i++
      }
    } else if (c === '\n') {
      op('\n')
      i++
      for (const h of heredocs.splice(0)) {
        const next = toks[h.idx + 1]
        const delim = next?.k === 'w' ? next.w.v : ''
        const lines: string[] = []
        while (i < src.length) {
          let end = src.indexOf('\n', i)
          if (end < 0) end = src.length
          const line = src.slice(i, end)
          i = Math.min(end + 1, src.length)
          if ((h.strip ? line.replace(/^\t+/, '') : line) === delim) break
          lines.push(line)
        }
        const t = toks[h.idx]
        if (t?.k === 'redir') t.body = lines.join('\n')
      }
    } else if (c === ';') {
      op(src[i + 1] === ';' ? ';;' : ';')
      i += src[i + 1] === ';' ? 2 : 1
    } else if (c === '|') {
      const o = src[i + 1] === '|' ? '||' : src[i + 1] === '&' ? '|&' : '|'
      op(o)
      i += o.length
    } else if (c === '&') {
      if (src[i + 1] === '>') {
        endWord()
        const o = src[i + 2] === '>' ? '&>>' : '&>'
        toks.push({ k: 'redir', op: o, dup: false })
        i += o.length
      } else {
        const o = src[i + 1] === '&' ? '&&' : '&'
        op(o)
        i += o.length
      }
    } else if (c === '(' || c === ')') {
      op(c)
      i++
    } else if ((c === '<' || c === '>') && src[i + 1] === '(') {
      const end = matchParen(src, i + 1)
      subs.push(src.slice(i + 2, end < 0 ? src.length : end))
      opaque = true
      dyn = true
      started = true
      i = end < 0 ? src.length : end + 1
    } else if (c === '<' || c === '>') {
      // Số đứng sát trước (`2>`) là số luồng, không phải từ.
      if (started && /^\d+$/.test(v) && !hasGlob && !dyn) {
        v = ''
        pat = ''
        started = false
      } else endWord()
      let o: string = c
      if (c === '>' && src[i + 1] === '>') o = '>>'
      else if (c === '>' && src[i + 1] === '|') o = '>|'
      else if (c === '<' && src.startsWith('<<<', i)) o = '<<<'
      else if (c === '<' && src.startsWith('<<-', i)) o = '<<-'
      else if (c === '<' && src[i + 1] === '<') o = '<<'
      i += o.length
      if ((o === '>' || o === '<') && src[i] === '&' && /[0-9-]/.test(src[i + 1] ?? '')) {
        // `2>&1`, `>&-`: nhân đôi luồng, không có tệp.
        i++
        while (i < src.length && /[0-9-]/.test(src[i]!)) i++
        toks.push({ k: 'redir', op: o, dup: true })
      } else {
        if ((o === '>' || o === '<') && src[i] === '&') i++
        toks.push({ k: 'redir', op: o, dup: false })
        if (o === '<<' || o === '<<-') heredocs.push({ idx: toks.length - 1, strip: o === '<<-' })
      }
    } else if (c === '*' || c === '?') {
      glob(c)
      i++
    } else if (c === '[' && src.indexOf(']', i + 2) > 0) {
      glob(c)
      i++
    } else if (c === '{' && /^\{[^{}\s]*(,|\.\.)[^{}\s]*\}/.test(src.slice(i))) {
      const m = /^\{[^{}\s]*\}/.exec(src.slice(i))!
      for (const ch of m[0]) glob(ch)
      i += m[0].length
    } else {
      lit(c)
      i++
    }
  }
  endWord()
  return { toks, opaque, assigns }
}

const nameOf = (v: string) => basename(v).toLowerCase()

function skipOpts(ws: Word[], valued: ReadonlySet<string> = new Set()): Word[] {
  let i = 0
  while (i < ws.length && ws[i]!.v.startsWith('-') && ws[i]!.v !== '-') i += valued.has(ws[i]!.v) ? 2 : 1
  return ws.slice(i)
}

export interface ParseOptions {
  /** Thư mục làm việc của phiên; không có thì mọi đường tương đối là "không biết". */
  cwd?: string | undefined
  home: string
}

export function parseCommands(command: string, o: ParseOptions): Parsed {
  const out: Parsed = { cmds: [], opaque: false, assigns: false }
  const env = new Map<string, string>()
  const base = o.cwd ? resolve(o.cwd) : undefined

  const fix = (w: Word, cwd: string | null): Word => {
    if (!w.v.includes(PWD_MARK)) return w
    if (cwd === null) return { ...w, v: w.v.replaceAll(PWD_MARK, '$PWD'), dyn: true }
    return {
      ...w,
      v: w.v.replaceAll(PWD_MARK, cwd),
      ...(w.pat !== undefined ? { pat: w.pat.replaceAll(PWD_MARK, cwd) } : {}),
    }
  }

  const run = (src: string, start: string | null, depth: number): void => {
    if (depth > MAX_DEPTH) {
      out.opaque = true
      return
    }
    const lexed = lex(src, o.home, env)
    if (lexed.opaque) out.opaque = true
    if (lexed.assigns) out.assigns = true
    let cwd = start
    const stack: (string | null)[] = []
    let words: Word[] = []
    let redirs: Redirect[] = []
    let assignN = 0

    const emit = () => {
      let ws = words
      const rs = redirs
      const assigns = assignN
      words = []
      redirs = []
      assignN = 0
      while (ws.length && RESERVED.has(ws[0]!.v)) ws = ws.slice(1)
      if (!ws.length) return
      if (DROP_STATEMENT.has(ws[0]!.v)) return
      let elevated = false
      let viaXargs = false
      const heredoc = rs.find((r) => r.op.startsWith('<<') && r.body !== undefined)?.body
      for (let guard = 0; guard < 12 && ws.length; guard++) {
        const name = nameOf(ws[0]!.v)
        const rest = ws.slice(1)
        if (PLAIN_WRAPPERS.has(name)) ws = skipOpts(rest)
        else if (name === 'nice') ws = skipOpts(rest, new Set(['-n']))
        else if (name === 'caffeinate') ws = skipOpts(rest, new Set(['-t', '-w']))
        else if (name === 'stdbuf') ws = skipOpts(rest, new Set(['-i', '-o', '-e']))
        else if (name === 'timeout') ws = skipOpts(rest, new Set(['-s', '-k'])).slice(1)
        else if (name === 'env') {
          let k = 0
          while (k < rest.length && (rest[k]!.v.startsWith('-') || ASSIGN.test(rest[k]!.v)))
            k += rest[k]!.v === '-u' || rest[k]!.v === '-C' ? 2 : 1
          ws = rest.slice(k)
        } else if (name === 'xargs') {
          viaXargs = true
          ws = skipOpts(rest, XARGS_VALUED)
        } else if (ELEVATE.has(name)) {
          elevated = true
          break
        } else break
      }
      if (!ws.length) return
      const name = nameOf(ws[0]!.v)
      const args = ws.slice(1)
      if (SHELLS.has(name) && !elevated) {
        // `bash -c '…'`: phần trong là một lệnh nữa.
        let script: Word | undefined
        for (let k = 0; k < args.length; k++) {
          const a = args[k]!.v
          if (a.startsWith('-') && !a.startsWith('--') && a.includes('c')) {
            script = args[k + 1]
            break
          }
          if (!a.startsWith('-')) break
        }
        if (script) {
          if (script.dyn) out.opaque = true
          run(script.v, cwd, depth + 1)
          return
        }
        if (heredoc !== undefined && args.every((a) => a.v.startsWith('-'))) {
          run(heredoc, cwd, depth + 1)
          return
        }
      }
      if (name === 'eval' && !elevated) {
        if (args.some((a) => a.dyn)) out.opaque = true
        run(args.map((a) => a.v).join(' '), cwd, depth + 1)
        return
      }
      out.cmds.push({
        name,
        args,
        cwd,
        base,
        redirs: rs,
        nameDyn: ws[0]!.dyn,
        elevated,
        viaXargs,
        assigns,
        heredoc,
      })
      if (name === 'cd' || name === 'pushd') {
        const a = skipOpts(args)[0]
        cwd =
          a === undefined
            ? o.home
            : a.dyn || a.v === '-'
              ? null
              : isAbsolute(a.v)
                ? resolve(a.v)
                : cwd === null
                  ? null
                  : resolve(cwd, a.v)
      } else if (name === 'popd') cwd = null
    }

    for (let t = 0; t < lexed.toks.length; t++) {
      const tok = lexed.toks[t]!
      if (tok.k === 'op') {
        emit()
        if (tok.v === '(') stack.push(cwd)
        else if (tok.v === ')' && stack.length) cwd = stack.pop() ?? cwd
      } else if (tok.k === 'redir') {
        const r: Redirect = { op: tok.op, ...(tok.body !== undefined ? { body: tok.body } : {}) }
        const next = lexed.toks[t + 1]
        if (!tok.dup && next?.k === 'w') {
          for (const s of next.subs) {
            out.opaque = true
            run(s, cwd, depth + 1)
          }
          r.target = fix(next.w, cwd)
          t++
        }
        redirs.push(r)
      } else {
        for (const s of tok.subs) {
          out.opaque = true
          run(s, cwd, depth + 1)
        }
        if (tok.assign && words.length === 0) assignN++
        else words.push(fix(tok.w, cwd))
      }
    }
    emit()
  }

  run(command, base ?? null, 0)
  return out
}
