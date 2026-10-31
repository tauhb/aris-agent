/**
 * Dòng "Vừa làm gì" của Văn phòng (`/api/aris/stats?feed=1`): gộp việc của bot (nhận, xong, vấp), phiên đang chạy,
 * lần xin duyệt (đã trả lời lẫn còn treo) và hỏi người dùng, lần hàng rào chặn và routine chạy xong thành một danh sách
 * mới trước. Hàm thuần; nguồn đọc ở `index.ts`.
 */

export type FeedKind =
  | 'running'
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
  /** Mã phiên của việc (bot ngoài: mã lần chạy): giao diện mở kết quả hay chat đúng phiên này. */
  session?: string
  /** Mã yêu cầu quyền đang chờ {you}; chỉ có ở dòng xin duyệt còn treo. */
  approval?: string
}

export interface FeedInput {
  /** Việc của bot (`LiveTracker.activity`). */
  activity: readonly {
    bot: string
    kind: string
    task?: string | undefined
    session?: string | undefined
    at: number
  }[]
  /** Sự kiện duyệt và hỏi (`aris_stats.events`), đã gắn bot của phiên. */
  events: readonly {
    at: number
    bot: string
    session?: string | undefined
    type: 'approval' | 'question'
    what?: string | undefined
    tool?: string | undefined
    decision?: string | undefined
  }[]
  /** Lần hàng rào chặn công cụ. */
  blocked: readonly { at: number; bot: string; tool: string; what: string }[]
  /** Routine chạy xong. */
  routines: readonly { at: number; bot: string; title: string; status: 'done' | 'failed' | 'cap' }[]
  /** Phiên đang chạy (`LiveTracker.runningInfo`), kèm tên việc hay tên phiên; mỗi phiên một dòng "Đang làm". */
  running?: readonly { session: string; bot: string; title: string; at: number }[]
  /** Yêu cầu quyền đang chờ {you} (`arisApprovals.list`): mỗi yêu cầu một dòng có nút duyệt. */
  pending?: readonly { id: string; bot: string; session?: string | undefined; what: string; at: number }[]
}

/** "Bắt đầu" ngay sau "nhận việc" cùng việc là một: chỉ giữ dòng nhận việc. */
const SAME_START_MS = 60_000

export function mergeFeed(input: FeedInput, limit = 30): FeedItem[] {
  const out: FeedItem[] = []
  const running = input.running ?? []
  const live = new Set(running.map((r) => r.session))
  const assigned = input.activity.filter((a) => a.kind === 'assigned')
  const withSession = (session: string | undefined) => (session ? { session } : {})
  for (const a of input.activity) {
    const what = a.task ?? ''
    const ses = withSession(a.session)
    if (a.kind === 'assigned' || a.kind === 'started') {
      // Phiên đang chạy đã có dòng "Đang làm" riêng.
      if (a.session && live.has(a.session)) continue
    }
    if (a.kind === 'assigned') out.push({ at: a.at, bot: a.bot, kind: 'assigned', tone: 'ok', what, ...ses })
    else if (a.kind === 'done') out.push({ at: a.at, bot: a.bot, kind: 'done', tone: 'ok', what, ...ses })
    else if (a.kind === 'failed')
      out.push({ at: a.at, bot: a.bot, kind: 'failed', tone: 'bad', what, ...ses })
    else if (a.kind === 'started') {
      const dup = assigned.some(
        (x) => x.bot === a.bot && x.task === a.task && Math.abs(a.at - x.at) <= SAME_START_MS,
      )
      if (!dup) out.push({ at: a.at, bot: a.bot, kind: 'started', tone: 'ok', what, ...ses })
    }
    // `waiting` đã có dòng riêng từ sự kiện duyệt và hỏi.
  }
  for (const r of running)
    out.push({ at: r.at, bot: r.bot, kind: 'running', tone: 'ok', what: r.title, session: r.session })
  for (const e of input.events) {
    const what = e.what ?? e.tool ?? ''
    const ses = withSession(e.session)
    if (e.type === 'question') out.push({ at: e.at, bot: e.bot, kind: 'asked', tone: 'warn', what, ...ses })
    else if (e.decision?.startsWith('allowed'))
      out.push({ at: e.at, bot: e.bot, kind: 'approved', tone: 'ok', what, ...ses })
    else if (e.decision === 'rejected')
      out.push({ at: e.at, bot: e.bot, kind: 'rejected', tone: 'bad', what, ...ses })
    // Huỷ vì phiên kết thúc hay không có người trả lời không phải tin để hiện.
  }
  // Yêu cầu quyền còn treo: dòng "chờ {you}" có mã để duyệt ngay trên dòng.
  for (const p of input.pending ?? [])
    out.push({
      at: p.at,
      bot: p.bot,
      kind: 'asked',
      tone: 'warn',
      what: p.what,
      approval: p.id,
      ...withSession(p.session),
    })
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
  // Dòng "Đang làm" và yêu cầu còn treo luôn hiện, không bị giới hạn cắt mất.
  const pinned = (f: FeedItem) => f.kind === 'running' || f.approval !== undefined
  const sorted = out.sort((a, z) => z.at - a.at)
  const rest = sorted.filter((f) => !pinned(f)).slice(0, limit)
  return sorted.filter((f) => pinned(f) || rest.includes(f))
}
