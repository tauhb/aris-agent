/**
 * Kết quả của một phiên cho cột "Vừa làm gì" của Văn phòng (`/api/aris/stats?result=<phiên>`): câu trả lời cuối của bot,
 * các tệp bot đã ghi hay sửa trong phiên và trạng thái. Hàm thuần dựng từ log phiên của dsh; nguồn đọc ở `index.ts`.
 */
import { parseJson, textOf, type LogEntry } from './policy.js'

export type ResultStatus = 'running' | 'done' | 'failed' | 'waiting'

export interface ResultFile {
  /** Đường dẫn tương đối với thư mục làm việc của phiên; ngoài thư mục đó thì chỉ có tên tệp. */
  path: string
  name: string
}

export interface SessionResult {
  status: ResultStatus
  /** Toàn văn câu trả lời cuối của bot (bước `assistant` cuối có chữ); trống khi bot chưa trả lời. */
  text: string
  files: ResultFile[]
  /** Lúc bot trả lời lần cuối (ms); chưa trả lời thì lúc ghi cuối của log. */
  at: number
}

/** Công cụ của dsh ghi hay sửa tệp (`@deepseek-ai/dsh-tool-fs`), tham số `file_path`. */
export const WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'edit'])

const baseName = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? path

/** Đường dẫn gọn cho giao diện: tương đối với `cwd` khi nằm trong đó, không thì chỉ tên tệp. */
export function relativeTo(path: string, cwd: string | undefined): string {
  if (!path.startsWith('/')) return path.replace(/^\.\//, '')
  const root = cwd?.replace(/\/+$/, '')
  if (root && path.startsWith(`${root}/`)) return path.slice(root.length + 1)
  return baseName(path)
}

/** Đường dẫn trong tham số của lần gọi `write` hay `edit`; không đọc được thì chuỗi trống. */
function pathOfCall(args: unknown): string {
  const parsed = typeof args === 'string' ? parseJson(args) : args
  if (parsed && typeof parsed === 'object') {
    const a = parsed as Record<string, unknown>
    for (const key of ['file_path', 'path']) {
      const v = a[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return ''
  }
  // Tham số bị cắt dở hay không phải JSON: tìm khoá `file_path` bằng chữ.
  const m = typeof args === 'string' ? /"file_path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(args) : null
  if (!m?.[1]) return ''
  const unescaped = parseJson(`"${m[1]}"`)
  return typeof unescaped === 'string' ? unescaped : m[1]
}

export interface ResultOptions {
  /** Phiên đang chạy (dịch vụ bot theo dõi). */
  running?: boolean
  /** Phiên đang đợi {you} duyệt hay trả lời. */
  waiting?: boolean
  /** Thư mục làm việc của phiên, để rút gọn đường dẫn tệp. */
  cwd?: string | undefined
}

/**
 * Rút kết quả của phiên từ log:
 * - `text`: bước `assistant` cuối có chữ;
 * - `files`: tệp ở các lần gọi `write`, `edit` không báo lỗi, bỏ trùng, theo thứ tự ghi lần đầu;
 * - `status`: đang chạy, đang đợi, hay theo lượt cuối của log (`error` là lỗi, còn lại là xong).
 */
export function sessionResult(entries: readonly LogEntry[], opts: ResultOptions = {}): SessionResult {
  let text = ''
  let textAt = 0
  let lastTurn: string | undefined
  const calls: { callId: string; path: string }[] = []
  const failed = new Set<string>()
  for (const e of entries) {
    const data = (e.data ?? {}) as Record<string, unknown>
    if (e.type === 'assistant/message') {
      const t = textOf((data.message as { content?: unknown } | undefined)?.content)
      if (t.trim()) {
        text = t
        textAt = e.time
      }
    } else if (e.type === 'tool/call') {
      if (!WRITE_TOOLS.has(String(data.name ?? ''))) continue
      const path = pathOfCall(data.arguments)
      if (path) calls.push({ callId: String(data.callId ?? ''), path })
    } else if (e.type === 'tool/result') {
      const m = data.message as { toolCallId?: unknown; isError?: unknown } | undefined
      if (m?.isError && m.toolCallId) failed.add(String(m.toolCallId))
    } else if (e.type === 'turn/end') {
      lastTurn = String((data.reason as { kind?: unknown } | undefined)?.kind ?? '')
    }
  }
  const seen = new Set<string>()
  const files: ResultFile[] = []
  for (const c of calls) {
    if (failed.has(c.callId)) continue
    const path = relativeTo(c.path, opts.cwd)
    if (seen.has(path)) continue
    seen.add(path)
    files.push({ path, name: baseName(path) })
  }
  const status: ResultStatus = opts.running
    ? 'running'
    : opts.waiting
      ? 'waiting'
      : lastTurn === 'error'
        ? 'failed'
        : 'done'
  return { status, text, files, at: textAt || (entries.at(-1)?.time ?? 0) }
}
