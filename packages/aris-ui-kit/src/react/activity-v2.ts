/**
 * Bảng Hoạt động của giao diện mới (bản vẽ V8, V9), mở từ chuông ở thanh bên: việc cần người dùng (yêu cầu
 * duyệt, bot đang đợi), việc đang chạy, việc xong hay vấp trong ngày. Hàm thuần.
 */
import type { PendingApproval } from './external.js'
import type { TeamLive } from './team.js'

export interface ActivityEntry {
  key: string
  bot: string
  title: string
  /** Dòng phụ: tên bot. */
  sub: string
  at: number
  /** Phiên để mở khi bấm (có khi biết). */
  session?: string | undefined
  /** Mục hoạt động đã xong hay vấp. */
  failed?: boolean
}

export interface ActivityV2 {
  need: ActivityEntry[]
  running: ActivityEntry[]
  done: ActivityEntry[]
}

/** Số mục hoàn tất tối đa hiện trong ngày. */
const DONE_MAX = 20

const startOfDay = (now: number) => {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Chia việc thành ba phần của bảng Hoạt động; `running` khi thiếu tên việc dùng `busy` làm tiêu đề. */
export function activityV2(
  approvals: readonly PendingApproval[],
  live: TeamLive | null,
  nameOf: (id: string) => string,
  now: number,
  busy: string,
): ActivityV2 {
  const need: ActivityEntry[] = approvals.map((a) => ({
    key: `ap:${a.run}:${a.id}`,
    bot: a.bot,
    title: a.reason?.trim() || a.name,
    sub: nameOf(a.bot),
    at: now,
    session: a.parentSession,
  }))
  const asked = new Set(approvals.map((a) => a.bot))
  const running: ActivityEntry[] = []
  for (const [id, l] of Object.entries(live?.status ?? {})) {
    if (l.status === 'waiting' && !asked.has(id))
      need.push({
        key: `wait:${id}`,
        bot: id,
        title: l.task?.trim() || busy,
        sub: nameOf(id),
        at: l.since,
        session: l.sessions?.[0],
      })
    if (l.status === 'working')
      running.push({
        key: `run:${id}`,
        bot: id,
        title: l.task?.trim() || busy,
        sub: nameOf(id),
        at: l.since,
        session: l.sessions?.[0],
      })
  }
  const today = startOfDay(now)
  const done = (live?.activity ?? [])
    .filter((a) => (a.kind === 'done' || a.kind === 'failed') && a.at >= today)
    .sort((x, y) => y.at - x.at)
    .slice(0, DONE_MAX)
    .map((a, i) => ({
      key: `done:${a.bot}:${a.at}:${i}`,
      bot: a.bot,
      title: a.task?.trim() || nameOf(a.bot),
      sub: nameOf(a.bot),
      at: a.at,
      session: a.session,
      failed: a.kind === 'failed',
    }))
  return { need, running: running.sort((x, y) => y.at - x.at), done }
}
