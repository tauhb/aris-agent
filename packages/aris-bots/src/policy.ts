/**
 * Chính sách chung của phòng ban (quyết định 12, bản vẽ 2.6): model mặc định, ngân sách mỗi ngày,
 * quyền dùng công cụ. Áp cho mọi bot thường của phòng; Commander không theo chính sách phòng.
 */
import { isAbsolute, relative, resolve } from 'node:path'
import type { PolicyRecord } from './domain.js'

export type Policy = PolicyRecord

/** Quyền bật/tắt được. Đọc tệp luôn được; thao tác cần duyệt do dsh từ chối với bot được giao việc. */
export type Perm = 'web' | 'write' | 'shell'

export const DEFAULT_POLICY: Policy = { web: true, write: true, shell: false, onBudget: 'stop' }

/** Trần ngân sách mỗi ngày cao nhất nhận (USD), chặn gõ nhầm số không. */
const MAX_BUDGET = 1000

/** Công cụ của dsh cần quyền nào; công cụ khác (đọc, tìm tệp, nhắn đội…) không cần. */
const NEEDS: Record<string, Perm> = {
  web_search: 'web',
  web_fetch: 'web',
  write: 'write',
  edit: 'write',
  str_replace_editor: 'write',
  bash: 'shell',
  pwsh: 'shell',
  terminal_open: 'shell',
  terminal_send: 'shell',
}

export function needOf(tool: string, args: unknown): Perm | undefined {
  const need = NEEDS[tool]
  // `str_replace_editor` có lệnh `view` chỉ để đọc.
  if (tool === 'str_replace_editor' && (args as { command?: unknown } | undefined)?.command === 'view')
    return undefined
  return need
}

/** Nhóm công cụ bật/tắt trên hồ sơ bot (bản vẽ 2.2, Bộ công cụ). */
export type BotTool = 'web' | 'files' | 'shell'

const FILE_TOOLS = new Set(['read', 'read_image', 'glob', 'grep'])

/** Công cụ thuộc nhóm nào của Bộ công cụ; ghi tệp thuộc Quyền, không ở đây. */
export function botToolOf(tool: string, args: unknown): BotTool | undefined {
  if (FILE_TOOLS.has(tool)) return 'files'
  if (tool === 'str_replace_editor')
    return (args as { command?: unknown } | undefined)?.command === 'view' ? 'files' : undefined
  const need = NEEDS[tool]
  return need === 'web' || need === 'shell' ? need : undefined
}

/** Đường dẫn tệp mà lệnh ghi nhắm tới (`write`, `edit`, `str_replace_editor` trừ `view`). */
export function writeTarget(tool: string, args: unknown): string | undefined {
  const a = (args ?? {}) as { file_path?: unknown; path?: unknown; command?: unknown }
  if (tool === 'write' || tool === 'edit') return typeof a.file_path === 'string' ? a.file_path : ''
  if (tool === 'str_replace_editor' && a.command !== 'view') return typeof a.path === 'string' ? a.path : ''
  return undefined
}

/** Đường dẫn nằm trong thư mục làm việc (đường dẫn tương đối tính từ thư mục làm việc). */
export function insideDir(target: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(dir, target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

const TOOL_TEXT: Record<BotTool, string> = {
  web: 'tìm và đọc web',
  files: 'đọc tệp',
  shell: 'chạy lệnh terminal',
}

/** Lời từ chối khi bộ công cụ của chính bot tắt nhóm này. */
export function botDenyReason(tool: BotTool, bot: string): string {
  return `Bộ công cụ của ${bot} đang tắt "${TOOL_TEXT[tool]}". Đừng thử lại cách khác để lách; báo người giao việc rằng việc này cần ${TOOL_TEXT[tool]}, hoặc nhờ bot khác.`
}

const PERM_TEXT: Record<Perm, string> = {
  web: 'tìm và đọc web',
  write: 'ghi, sửa tệp',
  shell: 'chạy lệnh terminal',
}

/** Lời từ chối gửi cho bot: nói rõ vì sao và nên làm gì thay. */
export function denyReason(perm: Perm, department: string | undefined): string {
  const where = department ? `Chính sách phòng ${department}` : 'Chính sách mặc định cho bot chưa xếp phòng'
  return `${where} không cho ${PERM_TEXT[perm]}. Đừng thử lại cách khác để lách; báo người giao việc rằng việc này cần quyền ${PERM_TEXT[perm]}, hoặc nhờ bot ở phòng có quyền đó.`
}

const bool = (v: unknown, prev: boolean) => (typeof v === 'boolean' ? v : prev)

/** Chính sách từ dữ liệu gửi lên (trang Phòng ban), giữ giá trị cũ cho trường không gửi. */
export function cleanPolicy(input: unknown, prev: Policy = DEFAULT_POLICY): Policy {
  const p = (input ?? {}) as Record<string, unknown>
  const out: Policy = {
    web: bool(p.web, prev.web),
    write: bool(p.write, prev.write),
    shell: bool(p.shell, prev.shell),
    onBudget: p.onBudget === 'warn' || p.onBudget === 'stop' ? p.onBudget : prev.onBudget,
  }
  // model: đối tượng là đặt, null là bỏ (theo cài đặt chung), không gửi là giữ.
  const model = p.model === undefined ? prev.model : p.model
  if (model && typeof model === 'object') {
    const m = model as { provider?: unknown; model?: unknown }
    if (typeof m.provider === 'string' && typeof m.model === 'string' && m.provider && m.model)
      out.model = { provider: m.provider, model: m.model }
  }
  // budgetUsd: số là đặt, null là bỏ trần, không gửi là giữ.
  const budget = p.budgetUsd === undefined ? prev.budgetUsd : p.budgetUsd
  if (typeof budget === 'number' && Number.isFinite(budget) && budget >= 0)
    out.budgetUsd = Math.min(MAX_BUDGET, Math.round(budget * 100) / 100)
  return out
}
