/**
 * Trạng thái trực tiếp của bot và việc gần đây của đội, suy từ sự kiện phiên: phiên của bot đang
 * chạy là "đang làm", đang đợi anh duyệt hoặc trả lời là "chờ anh", lượt vừa xong là "xong" hoặc
 * "lỗi". Việc gần đây (và kết quả gần nhất của mỗi bot) lưu bền qua `onLog`; khởi động lại thì
 * không còn phiên nào chạy nên đội về "rảnh" hoặc "xong" gần đây.
 */

export type LiveStatus = 'working' | 'waiting' | 'done' | 'failed' | 'idle'

export interface ActivityItem {
  bot: string
  kind: 'assigned' | 'started' | 'done' | 'failed' | 'waiting'
  /** Việc (khi biết, từ lúc Commander giao). */
  task?: string | undefined
  at: number
}

export interface BotLive {
  status: LiveStatus
  /** Việc đang làm hoặc vừa xong (khi biết). */
  task?: string | undefined
  /** Lúc đổi trạng thái (ms). */
  since: number
  /** Số phiên của bot đang chạy. */
  running: number
  /**
   * Mã phiên đang chạy hoặc đang đợi người dùng, đang chạy trước (bot ngoài: mã lần chạy). Văn phòng dùng
   * để mở chat, xem bước gần nhất, chen tin và dừng.
   */
  sessions: string[]
}

/** "Xong" hay "lỗi" chỉ hiện một lúc rồi về "rảnh". */
export const RECENT_MS = 30 * 60_000
const MAX_ACTIVITY = 30

export class LiveTracker {
  private running = new Map<string, Set<string>>()
  private waiting = new Map<string, number>()
  /** Phiên đang đợi người dùng duyệt hoặc trả lời (số lần đợi chồng nhau). */
  private waitingSessions = new Map<string, number>()
  private last = new Map<string, { status: 'done' | 'failed'; at: number; task?: string | undefined }>()
  private since = new Map<string, number>()
  /** Phiên → việc được giao. */
  private tasks = new Map<string, string>()
  readonly activity: ActivityItem[] = []

  constructor(
    private botOf: (sessionId: string) => string,
    private now: () => number = Date.now,
    /** Lưu bền từng mục việc gần đây. */
    private onLog?: (item: ActivityItem) => void,
  ) {}

  /** Nạp lại việc gần đây đã lưu (mới trước) và kết quả gần nhất của từng bot. */
  restore(items: readonly ActivityItem[]) {
    const sorted = [...items].sort((a, b) => b.at - a.at).slice(0, MAX_ACTIVITY)
    this.activity.splice(0, this.activity.length, ...sorted)
    for (const a of [...sorted].reverse())
      if (a.kind === 'done' || a.kind === 'failed')
        this.last.set(a.bot, { status: a.kind, at: a.at, task: a.task })
  }

  private log(item: Omit<ActivityItem, 'at'>) {
    const full = { ...item, at: this.now() }
    this.activity.unshift(full)
    this.activity.length = Math.min(this.activity.length, MAX_ACTIVITY)
    this.onLog?.(full)
  }

  /** Commander giao việc cho bot (phiên con khi đã biết). */
  assigned(bot: string, task: string, sessionId?: string) {
    if (sessionId) this.tasks.set(sessionId, task)
    this.log({ bot, kind: 'assigned', task })
    // Bot mới thường đã chạy trước lúc Commander kịp ghi việc: ghi luôn "bắt đầu".
    if (sessionId && this.running.get(bot)?.has(sessionId)) this.log({ bot, kind: 'started', task })
  }

  /** Gắn việc cho phiên con khi biết mã phiên sau lúc giao. */
  taskOf(sessionId: string, task: string) {
    this.tasks.set(sessionId, task)
  }

  turnStart(sessionId: string) {
    const bot = this.botOf(sessionId)
    let set = this.running.get(bot)
    if (!set) this.running.set(bot, (set = new Set()))
    if (set.size === 0) this.since.set(bot, this.now())
    set.add(sessionId)
    const task = this.tasks.get(sessionId)
    if (task) this.log({ bot, kind: 'started', task })
  }

  turnEnd(sessionId: string, reason: string) {
    const bot = this.botOf(sessionId)
    this.running.get(bot)?.delete(sessionId)
    const task = this.tasks.get(sessionId)
    if (reason === 'completed' || reason === 'error') {
      const status = reason === 'completed' ? 'done' : 'failed'
      this.last.set(bot, { status, at: this.now(), task })
      if (task) this.log({ bot, kind: status, task })
    }
    this.since.set(bot, this.now())
  }

  /** Bot ngoài không có phiên: aris báo bắt đầu theo mã lần chạy. */
  externalStart(bot: string, runId: string, task: string) {
    let set = this.running.get(bot)
    if (!set) this.running.set(bot, (set = new Set()))
    if (set.size === 0) this.since.set(bot, this.now())
    set.add(runId)
    this.tasks.set(runId, task)
    this.log({ bot, kind: 'started', task })
  }

  /** Lần chạy của bot ngoài kết thúc: xong hay vấp. */
  externalEnd(bot: string, runId: string, ok: boolean) {
    this.running.get(bot)?.delete(runId)
    const task = this.tasks.get(runId)
    const status = ok ? 'done' : 'failed'
    this.last.set(bot, { status, at: this.now(), task })
    if (task) this.log({ bot, kind: status, task })
    this.since.set(bot, this.now())
  }

  /** Bot ngoài đang đợi người dùng duyệt quyền (bật/tắt từng yêu cầu); `runId` để ghi tên việc. */
  externalWaiting(bot: string, on: boolean, runId?: string) {
    const n = (this.waiting.get(bot) ?? 0) + (on ? 1 : -1)
    if (n <= 0) this.waiting.delete(bot)
    else this.waiting.set(bot, n)
    this.since.set(bot, this.now())
    const task = runId ? this.tasks.get(runId) : undefined
    if (on) this.log({ bot, kind: 'waiting', ...(task ? { task } : {}) })
  }

  waitStart(sessionId: string) {
    const bot = this.botOf(sessionId)
    this.waiting.set(bot, (this.waiting.get(bot) ?? 0) + 1)
    this.waitingSessions.set(sessionId, (this.waitingSessions.get(sessionId) ?? 0) + 1)
    this.since.set(bot, this.now())
    this.log({ bot, kind: 'waiting', task: this.tasks.get(sessionId) })
  }

  waitEnd(sessionId: string) {
    const bot = this.botOf(sessionId)
    const n = (this.waiting.get(bot) ?? 1) - 1
    if (n <= 0) this.waiting.delete(bot)
    else this.waiting.set(bot, n)
    const s = (this.waitingSessions.get(sessionId) ?? 1) - 1
    if (s <= 0) this.waitingSessions.delete(sessionId)
    else this.waitingSessions.set(sessionId, s)
  }

  /** Trạng thái một phiên (thẻ Kanban theo phiên của bot nhận thẻ). */
  sessionState(sessionId: string): 'waiting' | 'running' | 'idle' {
    if (this.waitingSessions.get(sessionId)) return 'waiting'
    for (const set of this.running.values()) if (set.has(sessionId)) return 'running'
    return 'idle'
  }

  /** Mọi phiên đang chạy (dừng khẩn cấp, @aris/guard). */
  runningSessions(): string[] {
    const out = new Set<string>()
    for (const set of this.running.values()) for (const id of set) out.add(id)
    return [...out]
  }

  /** Số phiên đang đợi người dùng duyệt hoặc trả lời. */
  waitingCount(): number {
    let n = 0
    for (const v of this.waitingSessions.values()) if (v > 0) n++
    return n
  }

  /** Số bot (trừ Commander) đang có phiên chạy. */
  busyBots(except?: string): number {
    let n = 0
    for (const [bot, set] of this.running) if (bot !== except && set.size > 0) n++
    return n
  }

  /** Phiên của bot đang chạy rồi đến phiên đang đợi người dùng (không lặp). */
  private sessionsOf(bot: string): string[] {
    const out = new Set(this.running.get(bot) ?? [])
    for (const [sid, n] of this.waitingSessions) if (n > 0 && this.botOf(sid) === bot) out.add(sid)
    return [...out]
  }

  of(bot: string): BotLive {
    const running = this.running.get(bot)?.size ?? 0
    const since = this.since.get(bot) ?? 0
    const sessions = this.sessionsOf(bot)
    const runningTask = sessions.map((s) => this.tasks.get(s)).find(Boolean)
    if (this.waiting.get(bot)) return { status: 'waiting', task: runningTask, since, running, sessions }
    if (running > 0) return { status: 'working', task: runningTask, since, running, sessions }
    const last = this.last.get(bot)
    if (last && this.now() - last.at < RECENT_MS)
      return { status: last.status, task: last.task, since: last.at, running, sessions }
    return { status: 'idle', since, running, sessions }
  }

  snapshot(bots: readonly string[]): { status: Record<string, BotLive>; activity: ActivityItem[] } {
    return {
      status: Object.fromEntries(bots.map((b) => [b, this.of(b)])),
      activity: this.activity.slice(0, 15),
    }
  }
}

/** Một việc gần đây của bot trong cột phải hồ sơ: kết quả sau lần giao (đang làm nếu chưa có). */
export interface RecentTask {
  task: string
  at: number
  result: 'done' | 'failed' | 'open'
}

/**
 * Số liệu 7 ngày của một bot cho cột phải hồ sơ: số việc được giao (và hôm nay), số việc xong / vấp
 * (kết quả sau lần giao, theo tên việc), 3 việc gần nhất kèm kết quả.
 */
export function botStats(
  items: readonly { bot: string; kind: string; task?: string | undefined; at: number }[],
  bot: string,
  now = Date.now(),
): { assigned: number; today: number; done: number; failed: number; recent: RecentTask[] } {
  const mine = items.filter((a) => a.bot === bot && a.at >= now - 7 * 86_400_000).sort((a, b) => a.at - b.at)
  const midnight = new Date(now).setHours(0, 0, 0, 0)
  let done = 0
  let failed = 0
  const assigned = mine.filter((a) => a.kind === 'assigned')
  const resultOf = (a: (typeof mine)[number]): RecentTask['result'] => {
    const end = mine
      .filter((x) => x.at >= a.at && x.task === a.task && (x.kind === 'done' || x.kind === 'failed'))
      .pop()
    return end?.kind === 'done' ? 'done' : end?.kind === 'failed' ? 'failed' : 'open'
  }
  for (const a of assigned) {
    const r = resultOf(a)
    if (r === 'done') done++
    else if (r === 'failed') failed++
  }
  const recent: RecentTask[] = []
  for (const a of [...assigned].reverse()) {
    if (!a.task || recent.some((r) => r.task === a.task)) continue
    recent.push({ task: a.task, at: a.at, result: resultOf(a) })
    if (recent.length >= 3) break
  }
  return {
    assigned: assigned.length,
    today: assigned.filter((a) => a.at >= midnight).length,
    done,
    failed,
    recent,
  }
}
