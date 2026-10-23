/**
 * Bảng việc của dự án (Kanban 4.3): thẻ của Team (bản ghi `team/task` trong phiên chính) và thẻ
 * người dùng tạo chờ chia, xếp vào năm cột theo bản vẽ.
 */
import type { CardRecord } from './domain.js'

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted'

export interface TaskLike {
  id: string
  subject: string
  description: string
  status: TaskStatus
  ownerId?: string
  blockedBy: string[]
}

export interface TeamState {
  tasks: Map<string, TaskLike>
  /** Phiên của thành viên đội → tên thành viên (tên gọi của bot). */
  members: Map<string, string>
}

/** Gom bản ghi `team/task`, `team/member` của phiên trưởng nhóm (bản sau đè bản trước). */
export function foldTeam(events: readonly { type: string; data?: unknown }[]): TeamState {
  const tasks = new Map<string, TaskLike>()
  const members = new Map<string, string>()
  for (const e of events) {
    if (e.type === 'team/task') {
      const t = (e.data as { task?: TaskLike } | undefined)?.task
      if (t?.id) tasks.set(t.id, { ...t, blockedBy: [...(t.blockedBy ?? [])] })
    } else if (e.type === 'team/member') {
      const m = (e.data as { member?: { id?: string; name?: string } } | undefined)?.member
      if (m?.id && m.name) members.set(m.id, m.name)
    }
  }
  return { tasks, members }
}

export type Column = 'unassigned' | 'ready' | 'doing' | 'waiting' | 'done'
export const COLUMNS: readonly Column[] = ['unassigned', 'ready', 'doing', 'waiting', 'done']

export interface CardView {
  id: string
  /** `task`: thẻ của Team; `draft`: thẻ người dùng tạo, chờ chia; `job`: việc lớn của một phòng ban. */
  kind: 'task' | 'draft' | 'job'
  title: string
  description?: string
  column: Column
  /** Bot nhận thẻ, hoặc bot người dùng gợi ý (thẻ chờ). */
  bot?: string
  /** Phiên của bot nhận thẻ (mở nhánh việc). */
  session?: string
  /** Thẻ đang chặn thẻ này (chưa xong). */
  waitingFor: { id: string; title: string }[]
  /** Việc lớn: tên phòng, tiến độ thẻ của phòng, có vấp không. */
  department?: string
  progress?: { done: number; total: number }
  failed?: boolean
}

/** Việc lớn của phòng ban (`@aris/commander`) trong dự án. */
export interface JobLike {
  id: string
  title: string
  departmentName: string
  lead: string
  session: string
  status: 'running' | 'done' | 'failed'
  progress: { done: number; total: number }
}

const order = (id: string) => Number(id.replace(/^\D+/, '')) || 0

export interface BoardInput {
  team: TeamState
  drafts: readonly CardRecord[]
  /** Bot của một thành viên đội theo tên gọi. */
  botOfHandle: (handle: string) => string | undefined
  /** Trạng thái phiên của bot nhận thẻ. */
  sessionState: (sessionId: string) => 'waiting' | 'running' | 'idle'
  jobs?: readonly JobLike[]
}

/**
 * Cột của từng thẻ:
 * - Chờ chia việc: thẻ chưa ai nhận (thẻ chờ của người dùng, thẻ Aris chia mà chưa giao).
 * - Sẵn sàng: đã giao, bot chưa bắt đầu (hoặc đang làm thẻ khác trước).
 * - Đang làm / Chờ duyệt: thẻ cũ nhất bot đang giữ, theo phiên của bot đang chạy hay đợi người dùng.
 * - Xong.
 */
export function buildBoard(b: BoardInput): CardView[] {
  const tasks = [...b.team.tasks.values()].filter((t) => t.status !== 'deleted')
  const byId = new Map(tasks.map((t) => [t.id, t]))
  // Thẻ đang làm cũ nhất của mỗi phiên bot: thẻ bot đang thật sự làm.
  const active = new Map<string, string>()
  for (const t of [...tasks].sort((x, y) => order(x.id) - order(y.id)))
    if (t.status === 'in_progress' && t.ownerId && !active.has(t.ownerId)) active.set(t.ownerId, t.id)
  const out: CardView[] = []
  for (const t of tasks) {
    const handle = t.ownerId ? b.team.members.get(t.ownerId) : undefined
    const bot = handle ? b.botOfHandle(handle) : undefined
    let column: Column
    if (t.status === 'completed') column = 'done'
    else if (t.status === 'pending' || !t.ownerId) column = 'unassigned'
    else if (active.get(t.ownerId) !== t.id) column = 'ready'
    else {
      const s = b.sessionState(t.ownerId)
      column = s === 'waiting' ? 'waiting' : s === 'running' ? 'doing' : 'ready'
    }
    out.push({
      id: t.id,
      kind: 'task',
      title: t.subject,
      ...(t.description ? { description: t.description } : {}),
      column,
      ...(bot ? { bot } : {}),
      ...(t.ownerId ? { session: t.ownerId } : {}),
      waitingFor: t.blockedBy.flatMap((id) => {
        const dep = byId.get(id)
        return dep && dep.status !== 'completed' ? [{ id, title: dep.subject }] : []
      }),
    })
  }
  for (const c of b.drafts) {
    if (c.taskId && byId.has(c.taskId)) continue
    out.push({
      id: c.id,
      kind: 'draft',
      title: c.title,
      ...(c.description ? { description: c.description } : {}),
      column: 'unassigned',
      ...(c.bot ? { bot: c.bot } : {}),
      waitingFor: [],
    })
  }
  // Việc lớn của phòng: đang chạy là Đang làm (trưởng nhóm đợi người dùng thì Chờ duyệt), vấp vẫn ở
  // Đang làm kèm cờ để người dùng xem.
  for (const j of b.jobs ?? [])
    out.push({
      id: j.id,
      kind: 'job',
      title: j.title,
      column: j.status === 'done' ? 'done' : b.sessionState(j.session) === 'waiting' ? 'waiting' : 'doing',
      bot: j.lead,
      session: j.session,
      waitingFor: [],
      department: j.departmentName,
      progress: j.progress,
      ...(j.status === 'failed' ? { failed: true } : {}),
    })
  const rank = { job: 0, task: 1, draft: 2 } as const
  return out.sort((x, y) => (x.kind === y.kind ? order(x.id) - order(y.id) : rank[x.kind] - rank[y.kind]))
}
