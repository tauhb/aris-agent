/**
 * Logic thuần của bảng chat gọn (bản vẽ `VanPhongChatBot`, `VanPhongChatAris`): đọc các bước phát lại của một phiên thành
 * tin của {you}, tin của bot, dòng tiến độ gộp các bước suy nghĩ và công cụ giữa hai tin, và khối "Đội đang làm" cho lần
 * Aris giao việc. Không gọi mạng.
 */

/** Một bước phát lại (`/api/aris/stats?replay=`), phần bảng chat dùng. */
export interface ConvStep {
  n: number
  at: number
  type: string
  title: string
  tool?: string | undefined
  error?: boolean | undefined
  /** Thời gian chạy của công cụ, hay model nghĩ ở bước trợ lý (ms). */
  ms?: number | undefined
  body: string
  bodyFull: boolean
  out?: string | undefined
  outFull?: boolean | undefined
}

export type Turn =
  | { kind: 'user'; key: string; at: number; text: string; pending?: boolean }
  | { kind: 'assistant'; key: string; at: number; text: string }
  /** Các bước suy nghĩ và công cụ giữa hai tin; `live` là đoạn cuối của phiên đang chạy. */
  | { kind: 'progress'; key: string; steps: ConvStep[]; live: boolean }
  /** Lần Aris giao việc cho đội (`giao_viec`, `giao_phong`): vẽ thành khối "Đội đang làm". */
  | { kind: 'team'; key: string; at: number; step: ConvStep }

type Tr = (key: string, params?: Record<string, unknown>) => string

/** Công cụ giao việc của Commander: cho từng bot (`giao_viec`) hay cả phòng (`giao_phong`); khối "Đội đang làm" đọc từ lần gọi này. */
export const DISPATCH_TOOLS: ReadonlySet<string> = new Set(['giao_viec', 'giao_phong'])

/**
 * Gộp các bước thành lượt chat: tin người dùng và tin trợ lý đứng riêng, mọi bước suy nghĩ, công cụ, duyệt giữa hai tin
 * gộp thành một dòng tiến độ, lần giao việc tách thành khối riêng. `running` đặt cờ `live` cho dòng tiến độ ở cuối.
 */
export function toTurns(steps: readonly ConvStep[], running: boolean): Turn[] {
  const out: Turn[] = []
  let group: ConvStep[] = []
  const flush = () => {
    if (group.length) out.push({ kind: 'progress', key: `p${group[0]!.n}`, steps: group, live: false })
    group = []
  }
  for (const s of steps) {
    if (s.type === 'user') {
      flush()
      out.push({ kind: 'user', key: `u${s.n}`, at: s.at, text: s.body })
    } else if (s.type === 'assistant') {
      flush()
      out.push({ kind: 'assistant', key: `a${s.n}`, at: s.at, text: s.body })
    } else if (s.type === 'tool' && DISPATCH_TOOLS.has(s.tool ?? '')) {
      flush()
      out.push({ kind: 'team', key: `t${s.n}`, at: s.at, step: s })
    } else group.push(s)
  }
  flush()
  const last = out.at(-1)
  if (running && last?.kind === 'progress') last.live = true
  return out
}

/** Tin vừa gửi đi, chờ lần đọc kế tiếp thấy nó trong phiên. */
export interface Echo {
  id: string
  text: string
  at: number
}

/** Giữ lại các tin đang gửi mà lần đọc chưa thấy (cùng chữ, của {you}, không cũ hơn lúc gửi quá một phút). */
export function pendingEcho(steps: readonly ConvStep[], echoes: readonly Echo[]): Echo[] {
  const users = steps.filter((s) => s.type === 'user')
  return echoes.filter((e) => !users.some((u) => u.body.trim() === e.text.trim() && u.at >= e.at - 60_000))
}

/** Thời gian ngắn: "45 giây", "1 phút 20", "2 giờ 5 phút"; dưới một giây tính là 1 giây. */
export function fmtDuration(ms: number, t: Tr): string {
  const total = Math.max(1, Math.round(ms / 1000))
  if (total < 60) return t('of.ch.sec', { n: total })
  const min = Math.floor(total / 60)
  if (min < 60) {
    const s = total % 60
    return s ? t('of.ch.min', { m: min, s }) : t('of.ch.min0', { m: min })
  }
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? t('of.ch.hr', { h, m }) : t('of.ch.hr0', { h })
}

/** Thời gian của cả dòng tiến độ: từ bước đầu tới lúc bước cuối chạy xong (đang chạy thì tới `now`). */
export function progressMs(turn: Extract<Turn, { kind: 'progress' }>, now: number): number {
  const first = turn.steps[0]?.at ?? now
  if (turn.live) return Math.max(0, now - first)
  const end = Math.max(...turn.steps.map((s) => s.at + (s.type === 'tool' ? (s.ms ?? 0) : 0)))
  return Math.max(0, end - first)
}

/** Tiêu đề ngắn của một bước trong danh sách xổ ra: bước suy nghĩ, hỏi, duyệt, chặn có nhãn đứng trước. */
export function stepLabel(s: ConvStep, t: Tr): string {
  switch (s.type) {
    case 'thinking':
      return t('of.ch.think', { title: s.title })
    case 'hoi':
      return t('of.ch.ask', { title: s.title })
    case 'duyet':
      return t('of.ch.approval', { title: s.title })
    case 'chan':
      return t('of.ch.blocked', { title: s.title })
    default:
      return s.title
  }
}

/**
 * Dòng tiến độ: đang chạy thì "tiêu đề bước cuối · N bước · thời gian" (kèm chấm nháy ở giao diện), xong rồi thì
 * "N bước · thời gian".
 */
export function progressText(turn: Extract<Turn, { kind: 'progress' }>, now: number, t: Tr): string {
  const steps = t('of.ch.steps', { n: turn.steps.length })
  const time = fmtDuration(progressMs(turn, now), t)
  const last = turn.steps.at(-1)
  return turn.live && last ? `${stepLabel(last, t)} · ${steps} · ${time}` : `${steps} · ${time}`
}

// --- Khối "Đội đang làm" ---------------------------------------------------------------------------------------------

/** Tình trạng một nhánh của khối "Đội đang làm". */
export type BranchState = 'running' | 'waiting' | 'done' | 'failed'

/** Phần dùng tới của một việc Aris giao (đọc từ `dispatchItems` của `@aris/ui-kit`). */
export interface BranchItem {
  sessionId?: string | undefined
  externalRun?: string | undefined
  error?: string | undefined
  rejected?: boolean | undefined
}

/**
 * Tình trạng một nhánh. Giao không được hay bị từ chối là lỗi; có yêu cầu quyền đang chờ là chờ {you}; còn lại theo
 * trạng thái của phiên (`?result=`) hay lần chạy của bot ngoài. Chưa đọc được thì coi là đang làm (vừa giao).
 */
export function branchState(
  item: BranchItem,
  read: { session?: string | undefined; run?: string | undefined } | null,
  hasApproval: boolean,
): BranchState {
  if (item.error || item.rejected) return 'failed'
  if (hasApproval) return 'waiting'
  if (item.externalRun) {
    const s = read?.run
    return s === 'done' ? 'done' : s === 'failed' || s === 'stopped' ? 'failed' : 'running'
  }
  const s = read?.session
  return s === 'done' ? 'done' : s === 'failed' ? 'failed' : s === 'waiting' ? 'waiting' : 'running'
}

/** Số nhánh đã xong trên tổng, và phần trăm cho thanh tiến độ (không có nhánh thì 0). */
export function teamProgress(states: readonly BranchState[]): { done: number; total: number; pct: number } {
  const done = states.filter((s) => s === 'done').length
  return { done, total: states.length, pct: states.length ? Math.round((done / states.length) * 100) : 0 }
}

// --- Giao cả phòng (`giao_phong`) ------------------------------------------------------------------------------------

/** Việc lớn của phòng ban (`/api/aris/commander?jobs=1`), phần dùng tới. */
export interface JobLike {
  id: string
  department: string
  departmentName: string
  /** Mã nội bộ của bot trưởng nhóm. */
  lead: string
  title: string
  /** Phiên gốc của trưởng nhóm cho việc này. */
  session: string
  /** Phiên của Commander đã giao việc. */
  parentSession: string
  status: 'running' | 'done' | 'failed'
  createdAt: string
}

/** Tên phòng và tên việc trong tham số của lần gọi `giao_phong`; tên việc cắt giống lúc máy chủ ghi việc (dòng đầu, 80 ký tự). */
export function phongArgs(body: string): { phong: string; title: string } | null {
  try {
    const v = JSON.parse(body) as { phong?: unknown; tieu_de?: unknown; noi_dung?: unknown }
    const title = String(v.tieu_de ?? v.noi_dung ?? '')
      .trim()
      .split('\n')[0]!
      .slice(0, 80)
    return { phong: typeof v.phong === 'string' ? v.phong : '', title }
  } catch {
    return null
  }
}

/**
 * Việc lớn do đúng lần gọi `giao_phong` này tạo ra: cùng phiên giao, cùng tên việc, gần lúc gọi nhất. Dữ liệu có cấu trúc
 * của máy chủ, không đọc lại từ câu chữ trả về.
 */
export function matchJob(
  step: { at: number; body: string },
  parent: string | undefined,
  jobs: readonly JobLike[],
): JobLike | undefined {
  const args = phongArgs(step.body)
  if (!args || !parent) return undefined
  return jobs
    .filter((j) => j.parentSession === parent && j.title === args.title)
    .sort(
      (a, z) => Math.abs(Date.parse(a.createdAt) - step.at) - Math.abs(Date.parse(z.createdAt) - step.at),
    )[0]
}

/**
 * Tình trạng nhánh trưởng nhóm: yêu cầu quyền đang chờ thì chờ {you}; việc lớn xong hay lỗi theo bản ghi việc; còn chạy
 * thì theo phiên của trưởng nhóm (đang đợi hay đã vấp).
 */
export function jobState(
  job: Pick<JobLike, 'status'>,
  session: string | undefined,
  hasApproval: boolean,
): BranchState {
  if (hasApproval) return 'waiting'
  if (job.status === 'done') return 'done'
  if (job.status === 'failed' || session === 'failed') return 'failed'
  return session === 'waiting' ? 'waiting' : 'running'
}

/**
 * Nhánh của lần `giao_phong`: trưởng nhóm theo việc lớn tìm được (phiên của trưởng nhóm, tên việc); chưa tìm được và lần
 * gọi đã trả lời không phải "Đã giao…" thì là lỗi (lời báo dòng đầu); còn lại là đang giao.
 */
export function phongItem(
  step: { body: string; out?: string | undefined },
  job: JobLike | undefined,
  leadHandle: string,
): (BranchItem & { handle: string; title: string }) | null {
  const args = phongArgs(step.body)
  if (!args) return null
  if (job) return { handle: leadHandle, title: job.title, sessionId: job.session }
  const first = step.out
    ?.split('\n')
    .find((l) => l.trim())
    ?.trim()
  if (step.out !== undefined && !step.out.startsWith('Đã giao'))
    return { handle: '', title: args.title, error: first || 'không giao được' }
  return { handle: '', title: args.title }
}
