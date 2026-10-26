/**
 * Logic thuần của cột "Vừa làm gì" (bản vẽ `VanPhongNhatKy`): dòng nào có kết quả để mở, dòng nào chưa nhận, đoạn đầu của
 * kết quả, nhãn trạng thái của từng loại dòng, kết quả của bot ngoài. Không gọi mạng; chỗ lưu "đã nhận" nằm ở `localStorage`.
 */
import type { FeedItem } from './model.js'

/** Kết quả đã nhận: mã phiên → mốc `at` của dòng Xong đã nhận (phiên làm tiếp và xong lần nữa thì lại là mới). */
export type Seen = Record<string, number>

export const SEEN_KEY = 'aris.office.seen'
const SEEN_MAX = 500

/** Dòng Xong có phiên: bấm vào mở được kết quả. */
export const hasResult = (f: FeedItem): boolean => f.kind === 'done' && !!f.session

/** Kết quả chưa nhận: dòng Xong có phiên mà phiên đó chưa nhận tới mốc này. */
export const isUnread = (f: FeedItem, seen: Seen): boolean => hasResult(f) && (seen[f.session!] ?? 0) < f.at

/** Số kết quả mới trong các dòng đang hiện (cho pill "N kết quả mới"). */
export const unreadCount = (feed: readonly FeedItem[], seen: Seen): number =>
  feed.filter((f) => isUnread(f, seen)).length

/** Đánh dấu đã nhận; giữ 500 phiên nhận gần nhất. Không đổi bản cũ. */
export function markSeen(seen: Seen, f: FeedItem): Seen {
  if (!hasResult(f)) return seen
  const next: Seen = { ...seen, [f.session!]: Math.max(seen[f.session!] ?? 0, f.at) }
  const keys = Object.keys(next)
  if (keys.length <= SEEN_MAX) return next
  return Object.fromEntries(
    keys
      .sort((a, z) => next[z]! - next[a]!)
      .slice(0, SEEN_MAX)
      .map((k) => [k, next[k]!]),
  )
}

/** Đọc "đã nhận" đã lưu; không đọc được thì chưa nhận gì. */
export function loadSeen(): Seen {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(
        (e): e is [string, number] => typeof e[1] === 'number',
      ),
    )
  } catch {
    return {}
  }
}

export function saveSeen(seen: Seen): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    /* trình duyệt chặn lưu: lần sau mở lại thì chưa nhận */
  }
}

/** Màu pill trạng thái: `run` có chấm nháy. */
export type PillTone = 'run' | 'ok' | 'warn' | 'err' | 'dim'

/**
 * Pill trạng thái của một dòng: màu và khoá chữ (`of.fd.st.*` hay `of.feed.k.*`). Dòng hỏi {you} chỉ là "chờ" khi bot còn
 * đang đợi (hay đó là yêu cầu quyền còn treo); bot đã hết đợi thì chỉ còn là lần đã hỏi.
 */
export function pillOf(f: FeedItem, botWaiting = true): { tone: PillTone; key: string } {
  switch (f.kind) {
    case 'running':
      return { tone: 'run', key: 'of.fd.st.running' }
    case 'asked':
      return f.approval || botWaiting
        ? { tone: 'warn', key: 'of.fd.st.waiting' }
        : { tone: 'dim', key: 'of.feed.k.asked' }
    case 'done':
    case 'approved':
    case 'routine':
      return { tone: 'ok', key: `of.feed.k.${f.kind}` }
    case 'failed':
    case 'rejected':
    case 'blocked':
    case 'routineFailed':
      return { tone: 'err', key: `of.feed.k.${f.kind}` }
    default:
      return { tone: 'dim', key: `of.feed.k.${f.kind}` }
  }
}

/** Mã định danh một dòng để React phân biệt và để nhớ dòng nào đang mở. */
export const rowKey = (f: FeedItem): string =>
  `${f.at}-${f.bot}-${f.kind}-${f.session ?? ''}-${f.approval ?? ''}-${f.what}`

/**
 * Đoạn đầu của kết quả để hiện trong dòng: cắt ở `max` ký tự, lùi về khoảng trắng gần nhất và bỏ dấu đậm hay mã dở dang
 * để không vỡ định dạng Markdown.
 */
export function excerpt(text: string, max = 280): { text: string; cut: boolean } {
  const t = text.trim()
  if (t.length <= max) return { text: t, cut: false }
  let s = t.slice(0, max)
  // Không cắt đôi một ký tự ngoài bảng cơ bản (biểu tượng cảm xúc).
  if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1)
  const space = s.search(/\s\S*$/)
  if (space > max * 0.6) s = s.slice(0, space)
  s = s.trimEnd()
  if ((s.match(/\*\*/g)?.length ?? 0) % 2 === 1) s = s.slice(0, s.lastIndexOf('**')).trimEnd()
  if ((s.match(/`/g)?.length ?? 0) % 2 === 1) s = s.slice(0, s.lastIndexOf('`')).trimEnd()
  return { text: s, cut: true }
}

/** Phần dùng tới của một lần chạy bot ngoài (`/api/aris/commander?external=`). */
export interface RunLike {
  output?: string | undefined
  diagnostic?: string | undefined
  steps?: readonly { kind: string; target?: string | undefined }[] | undefined
}

/** Kết quả hiện được của bot ngoài: lời báo cuối của agent và các tệp nó ghi hay sửa. */
export function externalResult(run: RunLike): { text: string; files: { path: string; name: string }[] } {
  const seen = new Set<string>()
  const files: { path: string; name: string }[] = []
  for (const s of run.steps ?? []) {
    if ((s.kind !== 'write' && s.kind !== 'edit') || !s.target || seen.has(s.target)) continue
    seen.add(s.target)
    files.push({ path: s.target, name: s.target.replace(/\/+$/, '').split('/').pop() || s.target })
  }
  return { text: (run.output ?? run.diagnostic ?? '').trim(), files }
}
