/**
 * Logic thuần của trang Văn phòng (bản vẽ `VanPhong2D`, `VanPhongPhongBan`): câu bong bóng của Aris dựng từ dữ liệu
 * thật, bàn làm việc theo phòng ban, việc đang chờ người dùng, thẻ phòng ban, lọc dòng "Vừa làm gì". Không gọi mạng.
 */
import type { BotStatus, TeamMember } from '@aris/ui-kit'
import type { BotData, CatalogGroup, PendingApproval, TeamLive, TeamView } from '@aris/ui-kit/react'

type Params = Record<string, unknown>
type Tr = (key: string, params?: Params) => string

/** Ba dáng của một bàn: làm việc, đợi người dùng, nghỉ (xong và vấp cũng vẽ là nghỉ, khác ở chữ trạng thái). */
export type Scene = 'work' | 'wait' | 'idle'

export const sceneOf = (status: BotStatus): Scene =>
  status === 'working' ? 'work' : status === 'waiting' ? 'wait' : 'idle'

/** Một dòng của "Vừa làm gì" (`/api/aris/stats?feed=1`, `@aris/stats`). */
export interface FeedItem {
  at: number
  bot: string
  kind:
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
  tone: 'ok' | 'warn' | 'bad'
  what: string
}

// --- Bàn làm việc ----------------------------------------------------------------------------------------------

/** Linh vật của một bot để vẽ: dáng và phụ kiện (bỏ trống phụ kiện là mặc định của dáng). */
export interface Face {
  id: string
  accessory?: string | undefined
}

export interface Desk {
  id: string
  name: string
  role: string
  mascot: string
  accessory?: string | undefined
  status: BotStatus
  scene: Scene
  /** Việc đang làm: việc được giao, không có thì tên phiên đang chạy. */
  task: string
  /** Lúc đổi trạng thái (ms); 0 là chưa biết. */
  since: number
  /** Tên model riêng của bot; bot dùng model mặc định thì trống. */
  model: string
  external: boolean
}

export interface DeskGroup {
  /** Mã phòng ban; bot chưa vào phòng nào ở nhóm có mã rỗng. */
  id: string
  label: string
  desks: Desk[]
  working: number
  waiting: number
}

/** Tên model hiển thị theo danh mục đang phục vụ; chưa có trong danh mục thì lấy mã model. */
export function modelLabel(
  catalog: readonly CatalogGroup[],
  m: { provider: string; model: string } | undefined,
): string {
  if (!m) return ''
  const found = catalog.find((g) => g.id === m.provider)?.models.find((x) => x.id === m.model)
  return found?.name || m.model
}

/** Việc của bot: việc được giao; chưa có thì tên phiên đang chạy (hay đang đợi). */
export function taskOf(live: TeamLive | null, bot: string): string {
  const l = live?.status[bot]
  const task = l?.task?.trim()
  if (task) return task
  for (const id of l?.sessions ?? []) {
    const title = live?.titles?.[id]?.trim()
    if (title) return title
  }
  return ''
}

const deskOf = (m: TeamMember, team: TeamView, live: TeamLive | null): Desk => {
  const bot = team.bots.find((b) => b.id === m.id)
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    mascot: m.mascot ?? m.id,
    accessory: m.accessory,
    status: m.status,
    scene: sceneOf(m.status),
    task: taskOf(live, m.id),
    since: live?.status[m.id]?.since ?? 0,
    model: modelLabel(team.catalog, bot?.model),
    external: !!bot?.external,
  }
}

/** Bàn của từng phòng ban (không gồm Aris, đứng riêng ở đầu trang); phòng không có bot thì bỏ. */
export function deskGroups(team: TeamView, live: TeamLive | null): DeskGroup[] {
  return team.groups
    .filter((g) => g.members.length > 0)
    .map((g) => {
      const desks = g.members.map((m) => deskOf(m, team, live))
      return {
        id: g.id,
        label: g.label,
        desks,
        working: desks.filter((d) => d.status === 'working').length,
        waiting: desks.filter((d) => d.status === 'waiting').length,
      }
    })
}

/** Bàn của riêng Aris (cho ngăn kéo khi bấm vào Aris). */
export const commanderDesk = (team: TeamView, live: TeamLive | null): Desk =>
  deskOf(team.commander, team, live)

// --- Việc chờ người dùng ---------------------------------------------------------------------------------------

export type Need =
  | { kind: 'approval'; id: string; bot: string; name: string; action: string; target: string }
  | { kind: 'question'; bot: string; name: string; session: string }

/**
 * Việc đang chờ người dùng: yêu cầu quyền của bot (duyệt hay từ chối ngay) và bot đang đợi trả lời mà không có
 * yêu cầu quyền nào (câu hỏi; trả lời trong chat). Bot ngoài không có phiên chat để mở nên không tính câu hỏi.
 */
export function needsYou(
  approvals: readonly PendingApproval[],
  live: TeamLive | null,
  bots: readonly BotData[],
): Need[] {
  const out: Need[] = approvals.map((a) => ({
    kind: 'approval' as const,
    id: a.id,
    bot: a.bot,
    name: a.name,
    action: a.kind,
    target: a.target ?? a.tool ?? '',
  }))
  const asking = new Set(approvals.map((a) => a.bot))
  for (const b of bots) {
    if (b.external || asking.has(b.id)) continue
    const l = live?.status[b.id]
    if (l?.status === 'waiting')
      out.push({ kind: 'question', bot: b.id, name: b.name, session: l.sessions?.[0] ?? '' })
  }
  return out
}

// --- Câu của Aris ----------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')
/** `HH:MM`. */
export const hhmm = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

const joinNames = (names: readonly string[], and: string) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')}${and}${names.at(-1)}`

/**
 * Câu trong bong bóng của Aris, dựng từ dữ liệu thật (không gọi model): số việc chờ người dùng, ai đang làm,
 * tối đa hai bot nghỉ lâu nhất từ hôm nay. Ví dụ "2 việc chờ bạn. Lâm với Hạ đang làm, Tín nghỉ từ 08:12."
 */
export function officeSummary(o: {
  need: number
  bots: readonly { name: string; status: BotStatus; since: number }[]
  t: Tr
  now?: number
}): string {
  const { need, bots, t } = o
  const now = o.now ?? Date.now()
  if (bots.length === 0 && need === 0) return t('of.sum.empty')
  const clauses: string[] = []
  const working = bots.filter((b) => b.status === 'working').map((b) => b.name)
  if (working.length) clauses.push(t('of.sum.working', { names: joinNames(working, t('of.sum.and')) }))
  const resting = bots
    .filter((b) => b.status === 'idle' && b.since > 0 && sameDay(b.since, now))
    .sort((a, b) => a.since - b.since)
    .slice(0, 2)
  for (const b of resting) clauses.push(t('of.sum.rest', { name: b.name, time: hhmm(b.since) }))
  const sentences: string[] = []
  if (need > 0) sentences.push(t('of.sum.need', { n: need }))
  if (clauses.length) sentences.push(`${clauses.join(', ')}.`)
  else if (need === 0) sentences.push(t('of.sum.calm'))
  return sentences.join(' ')
}

// --- Thẻ phòng ban ---------------------------------------------------------------------------------------------

export interface DeptCard {
  id: string
  name: string
  about: string
  members: { id: string; name: string; mascot: string; accessory?: string | undefined; status: BotStatus }[]
  working: number
  waiting: number
  /** Chi tiêu hôm nay (USD). */
  spent: number
  /** Ngân sách mỗi ngày; không đặt thì `null`. */
  cap: number | null
  /** Phần trăm đã dùng, 0–100 (0 khi không có ngân sách). */
  pct: number
  /** Model mặc định của phòng; không đặt thì trống. */
  model: string
}

/** Thẻ của từng phòng ban theo thứ tự phòng; `spend` là chi tiêu hôm nay theo mã phòng. */
export function deptCards(team: TeamView, spend: Readonly<Record<string, number>>): DeptCard[] {
  return team.departments.map((d) => {
    const members = (team.groups.find((g) => g.id === d.id)?.members ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      mascot: m.mascot ?? m.id,
      accessory: m.accessory,
      status: m.status,
    }))
    const spent = spend[d.id] ?? 0
    const cap = d.policy?.budgetUsd !== undefined && d.policy.budgetUsd > 0 ? d.policy.budgetUsd : null
    return {
      id: d.id,
      name: d.name,
      about: d.about ?? '',
      members,
      working: members.filter((m) => m.status === 'working').length,
      waiting: members.filter((m) => m.status === 'waiting').length,
      spent,
      cap,
      pct: cap ? Math.min(100, Math.round((spent / cap) * 100)) : 0,
      model: modelLabel(team.catalog, d.policy?.model),
    }
  })
}

/** Bot chưa vào phòng nào (kể cả Aris, đứng đầu). */
export function looseBots(
  team: TeamView,
): { id: string; name: string; role: string; mascot: string; accessory?: string | undefined }[] {
  const loose = team.groups.find((g) => g.id === '')?.members ?? []
  return [team.commander, ...loose].map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    mascot: m.mascot ?? m.id,
    accessory: m.accessory,
  }))
}

// --- Vừa làm gì ------------------------------------------------------------------------------------------------

/** Chỉ giữ dòng của các bot trong phòng đang chọn; `ids` rỗng (null) là tất cả. */
export const feedFor = (feed: readonly FeedItem[], ids: ReadonlySet<string> | null): FeedItem[] =>
  ids ? feed.filter((f) => ids.has(f.bot)) : [...feed]
