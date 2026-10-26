/**
 * Dòng "Vừa làm gì" của Văn phòng (`/api/aris/stats?feed=1`): gộp việc của bot (nhận, xong, vấp), lần xin duyệt và
 * hỏi người dùng, lần hàng rào chặn và routine chạy xong thành một danh sách mới trước. Hàm thuần; nguồn đọc ở `index.ts`.
 */

export type FeedKind =
  | 'assigned'
  | 'started'
  | 'done'
  | 'failed'
  | 'asked'
  | 'approved'
  | 'rejected'
  | 'blocked'
  | 'routine'
  | 'routineFailed'
/** Xanh là xong, cam là chờ hay hỏi, đỏ là bị chặn hay lỗi. */
export type FeedTone = 'ok' | 'warn' | 'bad'

export interface FeedItem {
  at: number
  bot: string
  kind: FeedKind
  tone: FeedTone
  /** Việc, lệnh hay tên routine; câu hoàn chỉnh do giao diện ghép theo ngôn ngữ. */
  what: string
}

export interface FeedInput {
  /** Việc của bot (`LiveTracker.activity`). */
  activity: readonly { bot: string; kind: string; task?: string | undefined; at: number }[]
  /** Sự kiện duyệt và hỏi (`aris_stats.events`), đã gắn bot của phiên. */
  events: readonly {
    at: number
    bot: string
    type: 'duyet' | 'hoi'
    what?: string | undefined
    tool?: string | undefined
    decision?: string | undefined
  }[]
  /** Lần hàng rào chặn công cụ. */
  blocked: readonly { at: number; bot: string; tool: string; what: string }[]
  /** Routine chạy xong. */
  routines: readonly { at: number; bot: string; title: string; status: 'done' | 'failed' | 'cap' }[]
}

/** "Bắt đầu" ngay sau "nhận việc" cùng việc là một: chỉ giữ dòng nhận việc. */
const SAME_START_MS = 60_000

export function mergeFeed(input: FeedInput, limit = 30): FeedItem[] {
  const out: FeedItem[] = []
  const assigned = input.activity.filter((a) => a.kind === 'assigned')
  for (const a of input.activity) {
    const what = a.task ?? ''
    if (a.kind === 'assigned') out.push({ at: a.at, bot: a.bot, kind: 'assigned', tone: 'ok', what })
    else if (a.kind === 'done') out.push({ at: a.at, bot: a.bot, kind: 'done', tone: 'ok', what })
    else if (a.kind === 'failed') out.push({ at: a.at, bot: a.bot, kind: 'failed', tone: 'bad', what })
    else if (a.kind === 'started') {
      const dup = assigned.some(
        (x) => x.bot === a.bot && x.task === a.task && Math.abs(a.at - x.at) <= SAME_START_MS,
      )
      if (!dup) out.push({ at: a.at, bot: a.bot, kind: 'started', tone: 'ok', what })
    }
    // `waiting` đã có dòng riêng từ sự kiện duyệt và hỏi.
  }
  for (const e of input.events) {
    const what = e.what ?? e.tool ?? ''
    if (e.type === 'hoi') out.push({ at: e.at, bot: e.bot, kind: 'asked', tone: 'warn', what })
    else if (e.decision?.startsWith('allowed'))
      out.push({ at: e.at, bot: e.bot, kind: 'approved', tone: 'ok', what })
    else if (e.decision === 'rejected')
      out.push({ at: e.at, bot: e.bot, kind: 'rejected', tone: 'bad', what })
    // Huỷ vì phiên kết thúc hay không có người trả lời không phải tin để hiện.
  }
  for (const b of input.blocked)
    out.push({
      at: b.at,
      bot: b.bot,
      kind: 'blocked',
      tone: 'bad',
      what: b.tool && b.what ? `${b.tool} · ${b.what}` : b.what || b.tool,
    })
  for (const r of input.routines)
    out.push({
      at: r.at,
      bot: r.bot,
      kind: r.status === 'done' ? 'routine' : 'routineFailed',
      tone: r.status === 'done' ? 'ok' : 'bad',
      what: r.title,
    })
  return out.sort((a, z) => z.at - a.at).slice(0, limit)
}
