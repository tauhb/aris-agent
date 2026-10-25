/**
 * Quyền đọc bộ não (đặc tả: docs/specs/aris-brain.md, mục "Bot khác truy xuất bộ não"). Sandbox của dsh
 * chỉ giới hạn ghi, không giới hạn đọc, nên aris tự chặn: công cụ của bộ não lọc theo quyền, công cụ đọc
 * tệp thường và lệnh bash chạm vào kho thì bị từ chối với bot không đủ quyền. Đây là rào chống bot lỡ tay
 * hay bị nội dung độc sai khiến, không chống người cố tình phá. Thuần.
 */
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { Entry } from './catalog.js'

/** Ai đang đọc: Commander và Thủ thư đọc hết; bot thường theo phòng ban và danh sách Cá nhân. */
export interface Reader {
  id: string
  role: 'commander' | 'librarian' | 'member'
  department?: string | undefined
}

export interface AccessRules {
  /** Bot (mã nội bộ) được đọc không gian Cá nhân, ngoài Aris và Thủ thư. */
  personal: readonly string[]
}

type Where = Pick<Entry, 'space' | 'layer' | 'dept' | 'depts'>

export function canRead(r: Reader, e: Where, rules: AccessRules): boolean {
  if (r.role !== 'member') return true
  if (e.layer === 'hop-thu-vao') return false
  if (!e.space) return true
  if (e.space === 'ca-nhan') return rules.personal.includes(r.id)
  if (e.dept) return r.department === e.dept
  if (e.depts.length) return !!r.department && e.depts.includes(r.department)
  return true
}

/** Đọc được mọi thứ trong kho (Commander, Thủ thư). */
export const readsAll = (r: Reader) => r.role !== 'member'

/** Đường dẫn tương đối trong kho (`/`), hay undefined khi nằm ngoài kho. */
export function insideVault(root: string, target: string, cwd: string): string | undefined {
  const abs = resolve(cwd, expandHome(target))
  const rel = relative(resolve(root), abs)
  if (rel === '') return ''
  if (rel.startsWith('..') || isAbsolute(rel)) return undefined
  return rel.split(sep).join('/')
}

/** Thư mục `dir` chứa cả kho (quét đệ quy từ đây sẽ đi qua kho). */
export function containsVault(root: string, dir: string, cwd: string): boolean {
  const rel = relative(resolve(cwd, expandHome(dir)), resolve(root))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

const expandHome = (p: string) => (p === '~' ? homedir() : p.startsWith('~/') ? homedir() + p.slice(1) : p)

/** Công cụ đọc tệp thường và đường dẫn chúng nhắm tới. */
export function readTarget(tool: string, args: unknown): { path: string; recursive: boolean } | undefined {
  const a = (args ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  if (tool === 'read' || tool === 'read_image') {
    const p = s(a.file_path)
    return p ? { path: p, recursive: false } : undefined
  }
  if (tool === 'glob' || tool === 'grep') return { path: s(a.path) ?? '.', recursive: true }
  if (tool === 'str_replace_editor' && a.command === 'view') {
    const p = s(a.path)
    return p ? { path: p, recursive: false } : undefined
  }
  return undefined
}

/** Lệnh bash có nhắc tới kho (đường dẫn đầy đủ, `~/…`, hay đoạn `aris/brain`). */
export function bashTouchesVault(command: string, root: string): boolean {
  const home = homedir()
  const r = resolve(root)
  const forms = new Set([
    r,
    r.startsWith(home) ? `~${r.slice(home.length)}` : r,
    '$HOME' + r.slice(home.length),
  ])
  if ([...forms].some((f) => command.includes(f))) return true
  const tail = r.split(sep).slice(-2).join('/')
  return command.includes(tail)
}

export const DENY_READ =
  'Thư mục này là bộ não của người dùng: đọc bằng brain_search và brain_read (đã lọc theo quyền của bạn), không đọc thẳng tệp. Phần bạn không có quyền đọc thì báo người giao việc.'
export const DENY_SCAN =
  'Đường dẫn này bao trùm bộ não của người dùng; thu hẹp đường dẫn (ví dụ thư mục làm việc), còn bộ não thì tra bằng brain_search.'
