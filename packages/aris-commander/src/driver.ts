/**
 * Driver (giai đoạn 4, đợt 4; đặc tả: docs/specs/aris-projects.md): mỗi nhịp xem bảng việc của một
 * dự án và quyết định giao thẻ nào, đánh thức Aris vì thẻ nào, giao lại thẻ vấp, báo thẻ kẹt. Thuần.
 */

/** Vấp liên tiếp chừng này lần thì ngừng tự đẩy thẻ. */
export const DRIVER_FAIL_LIMIT = 2
/** Thẻ đã giao mà không có kết quả chừng này (phút) và bot không chạy thì coi là kẹt. */
export const DRIVER_STUCK_MINUTES = 30
/** Nhịp của Driver. */
export const DRIVER_TICK_MS = 30_000
/** Kết quả thẻ trước đưa vào lời giao thẻ sau, mỗi thẻ tối đa ngần này ký tự. */
export const HANDOFF_MAX = 800

export interface DriverTask {
  id: string
  subject: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'deleted'
  /** Tên gọi của bot giữ thẻ (đã giao). */
  owner?: string | undefined
  blockedBy: readonly string[]
}

/** Lần giao gần nhất của một thẻ (nhật ký giao việc). */
export interface CardRun {
  at: string
  /** Phiên của bot nhận thẻ. */
  member: string
  outcome?: 'done' | 'failed' | 'stopped' | undefined
  answer?: string | undefined
}

/** Trạng thái riêng của Driver cho một dự án (bền). */
export interface DriverState {
  /** Thẻ đã đánh thức Aris (chưa có bot dự kiến). */
  woken: string[]
  /** Số lần vấp liên tiếp theo thẻ. */
  failures: Record<string, number>
  /** Lần giao đã đếm vấp (lúc giao), để không đếm một lần vấp hai lần. */
  counted: Record<string, string>
  /** Thẻ đã ngừng tự đẩy (vấp quá giới hạn). */
  gaveUp: string[]
  /** Thẻ đã báo kẹt. */
  stuck: string[]
  /** Đã báo xong hết thẻ. */
  allDone?: boolean | undefined
}

export const emptyDriverState = (): DriverState => ({
  woken: [],
  failures: {},
  counted: {},
  gaveUp: [],
  stuck: [],
})

export type DriverAction =
  | { kind: 'dispatch'; task: DriverTask; bot: string; retry?: string | undefined }
  | { kind: 'wake'; task: DriverTask }
  | { kind: 'give-up'; task: DriverTask; reason: string }
  | { kind: 'stuck'; task: DriverTask }
  | { kind: 'all-done'; count: number }

export interface DriverInput {
  tasks: readonly DriverTask[]
  /** Thẻ → bot dự kiến (tên gọi). */
  planned: ReadonlyMap<string, string>
  /** Thẻ → lần giao gần nhất. */
  runs: ReadonlyMap<string, CardRun>
  /** Phiên bot đang chạy (một lượt chưa xong). */
  running: (member: string) => boolean
  /** Số bot còn được giao thêm (giới hạn chạy cùng lúc của Commander). */
  slots: number
  state: DriverState
  now: Date
}

const live = (t: DriverTask) => t.status !== 'deleted'

/** Thẻ chưa giao, mọi thẻ phụ thuộc đã xong (hoặc đã xoá). */
export function isReady(t: DriverTask, byId: ReadonlyMap<string, DriverTask>): boolean {
  if (t.status !== 'pending' || t.owner) return false
  return t.blockedBy.every((id) => {
    const dep = byId.get(id)
    return !dep || dep.status === 'completed' || dep.status === 'deleted'
  })
}

/**
 * Một nhịp của Driver: các việc cần làm và trạng thái mới. Thẻ sẵn sàng có bot dự kiến thì giao (theo
 * số chỗ trống); không có thì đánh thức Aris (mỗi nhịp một thẻ, mỗi thẻ một lần); thẻ vấp thì giao lại
 * tới giới hạn rồi ngừng; thẻ im lâu thì báo kẹt; xong hết thì báo một lần.
 */
export function planDriver(i: DriverInput): { actions: DriverAction[]; state: DriverState } {
  const state: DriverState = {
    woken: [...i.state.woken],
    failures: { ...i.state.failures },
    counted: { ...i.state.counted },
    gaveUp: [...i.state.gaveUp],
    stuck: [...i.state.stuck],
    ...(i.state.allDone ? { allDone: true } : {}),
  }
  const actions: DriverAction[] = []
  const tasks = i.tasks.filter(live)
  const byId = new Map(i.tasks.map((t) => [t.id, t]))
  let slots = i.slots
  let woke = false

  // Thẻ đã giao: vấp thì giao lại hoặc ngừng; im lâu thì báo kẹt.
  for (const t of tasks) {
    if (t.status !== 'in_progress' || !t.owner || state.gaveUp.includes(t.id)) continue
    const run = i.runs.get(t.id)
    if (!run || i.running(run.member)) continue
    if (run.outcome === 'failed' && state.counted[t.id] !== run.at) {
      state.counted[t.id] = run.at
      const n = (state.failures[t.id] ?? 0) + 1
      state.failures[t.id] = n
      if (n >= DRIVER_FAIL_LIMIT) {
        state.gaveUp.push(t.id)
        actions.push({ kind: 'give-up', task: t, reason: `vấp ${n} lần liên tiếp` })
      } else if (slots > 0) {
        slots--
        actions.push({ kind: 'dispatch', task: t, bot: t.owner, retry: 'lượt trước vấp giữa chừng' })
      }
      continue
    }
    if (
      !run.outcome &&
      !state.stuck.includes(t.id) &&
      i.now.getTime() - Date.parse(run.at) >= DRIVER_STUCK_MINUTES * 60_000
    ) {
      state.stuck.push(t.id)
      actions.push({ kind: 'stuck', task: t })
    }
  }

  // Thẻ sẵn sàng: giao cho bot dự kiến, không có thì đánh thức Aris.
  for (const t of tasks.filter((x) => isReady(x, byId)).sort((a, b) => num(a.id) - num(b.id))) {
    const bot = i.planned.get(t.id)
    if (bot) {
      if (slots <= 0) continue
      slots--
      actions.push({ kind: 'dispatch', task: t, bot })
    } else if (!woke && !state.woken.includes(t.id)) {
      woke = true
      state.woken.push(t.id)
      actions.push({ kind: 'wake', task: t })
    }
  }

  if (tasks.length && tasks.every((t) => t.status === 'completed')) {
    if (!state.allDone) {
      state.allDone = true
      actions.push({ kind: 'all-done', count: tasks.length })
    }
  } else delete state.allDone

  // Thẻ xong thì quên số lần vấp.
  for (const t of tasks)
    if (t.status === 'completed') {
      delete state.failures[t.id]
      delete state.counted[t.id]
    }
  return { actions, state }
}

const num = (id: string) => Number(id.replace(/^\D+/, '')) || 0

/** Lời giao thẻ của Driver: nội dung thẻ, kết quả các thẻ phụ thuộc, lý do giao lại. */
export function driverTask(
  t: DriverTask,
  parents: readonly { id: string; subject: string; by?: string | undefined; answer?: string | undefined }[],
  retry?: string,
): string {
  const body = (t.description || t.subject).trim()
  const handoff = parents
    .filter((p) => p.answer?.trim())
    .map(
      (p) =>
        `- ${p.id} «${p.subject}»${p.by ? ` (${p.by})` : ''}: ${clip(p.answer!.trim().replace(/\s+\n/g, '\n'), HANDOFF_MAX)}`,
    )
  return [
    body,
    ...(handoff.length ? ['', 'Kết quả các thẻ làm trước (dùng làm đầu vào):', ...handoff] : []),
    ...(retry
      ? ['', `Đây là lần giao lại: ${retry}. Xem lại phần đã làm trong phiên này rồi làm tiếp cho xong.`]
      : []),
  ].join('\n')
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
