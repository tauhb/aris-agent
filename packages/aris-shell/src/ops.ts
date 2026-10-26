/**
 * Nhận diện việc nguy hiểm trên lệnh đã chuẩn hoá (`parseCommands`): xoá đệ quy ngoài thư mục, push đè, đọc Keychain,
 * in URL đăng nhập web, xoá bằng script, và các đích ghi của lệnh. Dùng chung cho `@aris/guard` và `@aris/acp`.
 */
import { basename, isAbsolute, resolve } from 'node:path'
import type { Cmd, Word } from './parse.js'
import { compHits, insideDir } from './paths.js'

/** Lệnh xoá. */
export const RM_LIKE = new Set(['rm', 'rmdir', 'unlink', 'shred', 'srm', 'trash'])

const isFlag = (w: Word) => w.v.startsWith('-') && w.v.length > 1

/** Các từ không phải cờ (sau `--` mọi từ là đối số). */
export function positionals(args: Word[]): Word[] {
  const out: Word[] = []
  let end = false
  for (const a of args) {
    if (!end && a.v === '--') end = true
    else if (end || !isFlag(a)) out.push(a)
  }
  return out
}

const baseName = (v: string) => basename(v).toLowerCase()

/**
 * Từ (đường dẫn) nằm ngoài thư mục làm việc. Không biết (biến, `cd` tới chỗ lạ, không có thư mục làm việc) thì coi
 * là ngoài. Sau `cd` tính cả hai cách (từ chỗ đã `cd` tới và từ thư mục gốc): `cd x && rm -r ../y` vẫn bị coi là
 * ngoài, an toàn hơn.
 */
export function outsideBase(w: Word, c: Cmd): boolean {
  if (w.dyn || !c.base) return true
  const tracked = isAbsolute(w.v) ? resolve(w.v) : c.cwd === null ? undefined : resolve(c.cwd, w.v)
  if (tracked === undefined || !insideDir(tracked, c.base)) return true
  return !isAbsolute(w.v) && !insideDir(resolve(c.base, w.v), c.base)
}

/** `rm` có cờ đệ quy. Tên lệnh không biết (`$(echo rm) -rf ~`) được coi như có thể là `rm`. */
export const recursiveRm = (c: Cmd): boolean => {
  if (c.name !== 'rm' && !c.nameDyn) return false
  for (const a of c.args) {
    if (a.v === '--') break
    if (a.v === '--recursive' || /^-[a-zA-Z]*[rR]/.test(a.v)) return true
  }
  return false
}

/** `rm` đệ quy mà đích nằm ngoài thư mục làm việc, không biết đích, hay là glob ẩn (`.*` khớp `..`). */
export function rmOutside(c: Cmd): boolean {
  if (!recursiveRm(c)) return false
  if (c.viaXargs) return true
  // Cờ còn biến (`rm -r${IFS}~`): không biết đích thật.
  if (c.args.some((a) => a.dyn && a.v.startsWith('-'))) return true
  for (const t of positionals(c.args)) {
    if (t.v === '*' || t.v === '/*') return true
    if (t.pat !== undefined && compHits(t.pat.split('/').pop() ?? '', '..')) return true
    if (outsideBase(t, c)) return true
  }
  return false
}

/** Gốc của `find` (các từ trước cờ đầu tiên); không có thì là thư mục hiện tại. */
export function findRoots(c: Cmd): Word[] {
  const roots: Word[] = []
  for (const a of c.args) {
    if (a.v.startsWith('-') || a.v === '(' || a.v === '!') break
    roots.push(a)
  }
  return roots.length ? roots : [{ v: '.', dyn: false }]
}

/** `find … -delete` hay `find … -exec rm`. */
export function findDeletes(c: Cmd): boolean {
  if (c.name !== 'find') return false
  const i = c.args.findIndex((a) => ['-exec', '-execdir', '-ok', '-okdir'].includes(a.v))
  return c.args.some((a) => a.v === '-delete') || (i >= 0 && RM_LIKE.has(baseName(c.args[i + 1]?.v ?? '')))
}

/** `find … -delete|-exec rm` mà gốc nằm ngoài thư mục làm việc. */
export function findDeletesOutside(c: Cmd): boolean {
  return findDeletes(c) && findRoots(c).some((r) => outsideBase(r, c))
}

/** Lệnh con của `git` và các từ sau nó, bỏ qua tuỳ chọn chung (`-c x=y`, `-C dir`, `--git-dir`…). */
export function gitCall(c: Cmd): { sub: string; rest: Word[] } | undefined {
  if (c.name !== 'git') return undefined
  let i = 0
  while (i < c.args.length) {
    const a = c.args[i]!.v
    if (a === '-C' || a === '-c' || /^--(git-dir|work-tree|namespace|exec-path)$/.test(a)) i += 2
    else if (a.startsWith('-')) i++
    else break
  }
  const sub = c.args[i]?.v
  return sub === undefined ? undefined : { sub, rest: c.args.slice(i + 1) }
}

/** `git [-c x=y] [-C dir] push` ép đè: `--force`, `--force-with-lease`, `-f`, hay refspec `+ref`. */
export function forcePush(c: Cmd): boolean {
  const g = gitCall(c)
  if (g?.sub !== 'push') return false
  return g.rest.some(
    (a) =>
      a.v === '--force' ||
      a.v.startsWith('--force-with-lease') ||
      (/^-[a-zA-Z]+$/.test(a.v) && a.v.includes('f')) ||
      (a.v.length > 1 && a.v.startsWith('+')),
  )
}

/** `security` đọc hay xuất khoá: `find-*-password`, `dump-keychain`, `export`, `unlock-keychain`, `-i`… */
export function keychainRead(c: Cmd): boolean {
  if (c.name !== 'security') return false
  return c.args.some(
    (a) =>
      /^-[a-zA-Z]*i[a-zA-Z]*$/.test(a.v) ||
      /^(find-[a-z]+-password|dump-keychain|export|unlock-keychain|set-keychain-settings)$/.test(a.v),
  )
}

/** Lệnh con của `aris` khi lệnh là CLI của aris (`aris`, `scripts/aris.mjs`, `pnpm aris:cli`); undefined nếu không phải. */
export function arisSub(c: Cmd): string | undefined {
  const sub = (ws: Word[]) => positionals(ws).find((w) => w.v !== '--')?.v ?? ''
  if (c.name === 'aris' || c.name === 'aris.mjs') return sub(c.args)
  if (/^(node|nodejs|bun|deno|tsx)$/.test(c.name)) {
    const i = c.args.findIndex((a) => baseName(a.v) === 'aris.mjs')
    return i >= 0 ? sub(c.args.slice(i + 1)) : undefined
  }
  if (/^(pnpm|npm|yarn|npx|bunx)$/.test(c.name)) {
    const i = c.args.findIndex((a) => a.v === 'aris:cli' || a.v === 'aris')
    return i >= 0 ? sub(c.args.slice(i + 1)) : undefined
  }
  return undefined
}

/** Lệnh in URL đăng nhập web (có token): `aris url`, `aris open`. */
export const printsLoginUrl = (c: Cmd): boolean => {
  const sub = arisSub(c)
  return sub === 'url' || sub === 'open'
}

const SCRIPT_RUNNERS = /^(python[0-9.]*|perl[0-9.]*|ruby|node|nodejs|bun|deno|php)$/
const DELETE_CALL =
  /rmtree\s*\(|os\.(remove|unlink|rmdir)\s*\(|\bunlink\s*\(|\brm_rf\b|\brm_r\b|rmSync\s*\(|rmdirSync\s*\(|\bfs\.rm\s*\(|\brimraf\b|remove_tree|File\.delete|FileUtils\.rm|\brmdir\s*\(/
const HOME_REF =
  /expanduser|homedir|Path\.home|os\.homedir|ENV\[['"]HOME|process\.env\.HOME|getenv\(['"]HOME|\$HOME/

/**
 * Xoá bằng script một dòng (`python -c`, `perl -e`, `node -e`, `ruby -e`) kèm đường tuyệt đối hay `~` ngoài thư
 * mục làm việc. Chỉ bắt kiểu hay gặp: không thể chặn tuyệt đối việc script làm gì với tệp.
 */
export function scriptDeletes(c: Cmd, home: string): boolean {
  if (!SCRIPT_RUNNERS.test(c.name)) return false
  const text = `${c.args.map((a) => a.v).join('\n')}\n${c.heredoc ?? ''}`
  if (!DELETE_CALL.test(text)) return false
  if (HOME_REF.test(text)) return true
  for (const m of text.matchAll(/(['"`])((?:~|\/)[^'"`\n]*)\1/g)) {
    const p = m[2]!.replace(/^~(?=$|\/)/, home)
    if (!c.base || !insideDir(p, c.base, home)) return true
  }
  return false
}

const NULLISH_SINK = /^\/dev\/(null|stdout|stderr|tty|fd\/\d+)$/

/** Đích ghi qua chuyển hướng (`>`, `>>`, `&>`…), không kể `/dev/null`. */
export function redirectTargets(c: Cmd): Word[] {
  return c.redirs
    .filter((r) => /^(>|>>|>\||&>|&>>)$/.test(r.op) && r.target !== undefined)
    .map((r) => r.target!)
    .filter((t) => !NULLISH_SINK.test(t.v))
}

/** Giá trị của cờ có đối số (`-o x`, `-ox`, `--output x`, `--output=x`). */
function flagValues(args: Word[], short: string, long: string): Word[] {
  const out: Word[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!.v
    if ((short && a === `-${short}`) || a === `--${long}`) {
      if (args[i + 1]) out.push(args[++i]!)
    } else if (a.startsWith(`--${long}=`)) out.push({ ...args[i]!, v: a.slice(long.length + 3) })
    else if (short && a.startsWith(`-${short}`) && !a.startsWith('--') && a.length > 2)
      out.push({ ...args[i]!, v: a.slice(2) })
  }
  return out
}

/**
 * Đích ghi của lệnh (không kể chuyển hướng): `tee`, `cp`, `mv`, `ln`, `install`, `rsync`, `scp`, `sed -i`, `dd of=`,
 * `curl -o`, `wget -O`, `touch`, `mkdir`, `chmod`, `rm`… Gồm cả nguồn của `mv` (bị bỏ đi). Chỉ là ước lượng.
 */
export function writeTargets(c: Cmd): Word[] {
  const pos = positionals(c.args)
  switch (c.name) {
    case 'tee':
    case 'touch':
    case 'mkdir':
    case 'chmod':
    case 'chown':
    case 'chgrp':
    case 'truncate':
    case 'rm':
    case 'rmdir':
    case 'unlink':
    case 'shred':
    case 'srm':
    case 'mv':
      return pos
    case 'cp':
    case 'install':
    case 'rsync':
    case 'scp':
    case 'ln': {
      const t = flagValues(c.args, 't', 'target-directory')
      return t.length ? t : pos.length > 1 ? [pos[pos.length - 1]!] : []
    }
    case 'sed': {
      if (
        !c.args.some((a) => /^-[a-zA-Z]*i/.test(a.v) || a.v === '--in-place' || a.v.startsWith('--in-place='))
      )
        return []
      // Từ đầu tiên là chương trình sed (trừ khi đưa bằng -e, -f), `-i ''` của macOS để lại từ rỗng.
      const files = pos.filter((a) => a.v !== '')
      return c.args.some(
        (a) => a.v === '-e' || a.v === '-f' || a.v.startsWith('--expression') || a.v.startsWith('--file'),
      )
        ? files
        : files.slice(1)
    }
    case 'dd':
      return c.args.filter((a) => a.v.startsWith('of=')).map((a) => ({ ...a, v: a.v.slice(3) }))
    case 'curl':
      return [...flagValues(c.args, 'o', 'output'), ...flagValues(c.args, '', 'output-dir')]
    case 'wget':
      return [...flagValues(c.args, 'O', 'output-document'), ...flagValues(c.args, 'P', 'directory-prefix')]
    default:
      return []
  }
}
