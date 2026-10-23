/**
 * Trạng thái trực tiếp của bot và việc gần đây của đội, suy từ sự kiện phiên: phiên của bot đang
 * chạy là "đang làm", đang đợi anh duyệt hoặc trả lời là "chờ anh", lượt vừa xong là "xong" hoặc
 * "lỗi". Chỉ giữ trong bộ nhớ: khởi động lại thì đội về "rảnh".
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
}

/** "Xong" hay "lỗi" chỉ hiện một lúc rồi về "rảnh". */
export const RECENT_MS = 30 * 60_000
const MAX_ACTIVITY = 30

export class LiveTracker {
  private running = new Map<string, Set<string>>()
  private waiting = new Map<string, number>()
  private last = new Map<string, { status: 'done' | 'failed'; at: number; task?: string | undefined }>()
  private since = new Map<string, number>()
  /** Phiên → việc được giao. */
  private tasks = new Map<string, string>()
  readonly activity: ActivityItem[] = []

  constructor(
    private botOf: (sessionId: string) => string,
    private now: () => number = Date.now,
  ) {}

  private log(item: Omit<ActivityItem, 'at'>) {
    this.activity.unshift({ ...item, at: this.now() })
    this.activity.length = Math.min(this.activity.length, MAX_ACTIVITY)
  }

  /** Commander giao việc cho bot (phiên con khi đã biết). */
  assigned(bot: string, task: string, sessionId?: string) {
    if (sessionId) this.tasks.set(sessionId, task)
    this.log({ bot, kind: 'assigned', task })
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

  waitStart(sessionId: string) {
    const bot = this.botOf(sessionId)
    this.waiting.set(bot, (this.waiting.get(bot) ?? 0) + 1)
    this.since.set(bot, this.now())
    this.log({ bot, kind: 'waiting', task: this.tasks.get(sessionId) })
  }

  waitEnd(sessionId: string) {
    const bot = this.botOf(sessionId)
    const n = (this.waiting.get(bot) ?? 1) - 1
    if (n <= 0) this.waiting.delete(bot)
    else this.waiting.set(bot, n)
  }

  /** Số bot (trừ Commander) đang có phiên chạy. */
  busyBots(except?: string): number {
    let n = 0
    for (const [bot, set] of this.running) if (bot !== except && set.size > 0) n++
    return n
  }

  of(bot: string): BotLive {
    const running = this.running.get(bot)?.size ?? 0
    const since = this.since.get(bot) ?? 0
    const runningTask = [...(this.running.get(bot) ?? [])].map((s) => this.tasks.get(s)).find(Boolean)
    if (this.waiting.get(bot)) return { status: 'waiting', task: runningTask, since, running }
    if (running > 0) return { status: 'working', task: runningTask, since, running }
    const last = this.last.get(bot)
    if (last && this.now() - last.at < RECENT_MS)
      return { status: last.status, task: last.task, since: last.at, running }
    return { status: 'idle', since, running }
  }

  snapshot(bots: readonly string[]): { status: Record<string, BotLive>; activity: ActivityItem[] } {
    return {
      status: Object.fromEntries(bots.map((b) => [b, this.of(b)])),
      activity: this.activity.slice(0, 15),
    }
  }
}
