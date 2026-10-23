/**
 * Đội bot thật từ `/api/aris/bots` (gói `@aris/bots`), dùng chung cho thanh bên, cột phải và các
 * trang. Mỗi gói client đóng gói một bản module này nên mỗi gói tự tải và giữ bản sao; sửa đội ở
 * đâu thì gói đó tải lại ngay, các gói khác thấy sau lần tải định kỳ.
 */
import { useSyncExternalStore } from 'react'
import { COMMANDER, type TeamGroup, type TeamMember } from '../demo.js'

export interface BotData {
  id: string
  kind: 'commander' | 'member'
  handle: string
  name: string
  role: string
  description: string
  soul: string
  mascot: string
  model?: { provider: string; model: string }
  department?: string
  createdAt: string
}

export interface DepartmentData {
  id: string
  name: string
  lead?: string
  order: number
}

export interface TemplateData {
  id: string
  name: string
  description: string
  bots: number
}

export interface CatalogGroup {
  id: string
  name: string
  models: { id: string; name: string }[]
}

export interface TeamSnapshot {
  bots: BotData[]
  departments: DepartmentData[]
  templates: TemplateData[]
  /** Model đang phục vụ, để chọn model riêng cho bot. */
  catalog?: CatalogGroup[]
  /** Vai mẫu (từ các đội mẫu) để điền sẵn khi tạo bot. */
  roles?: RolePreset[]
}

export interface RolePreset {
  role: string
  description: string
  soul: string
  mascot: string
}

const endpoint = () => new URL('api/aris/bots', document.baseURI)
let snap: TeamSnapshot | null = null
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined
let loading: Promise<void> | undefined

function set(next: TeamSnapshot) {
  snap = next
  for (const l of listeners) l()
}

/** Tải lại đội (sau khi sửa ở nơi khác hoặc định kỳ). */
export function refreshTeam(): Promise<void> {
  loading ??= fetch(endpoint(), { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<TeamSnapshot>) : undefined))
    .then((d) => d && set(d))
    .catch(() => {})
    .finally(() => (loading = undefined))
  return loading
}

/** Gọi một thao tác của `/api/aris/bots`; lỗi ném ra với lời báo của máy chủ. */
export async function teamAction<R = TeamSnapshot>(body: Record<string, unknown>): Promise<R> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = (await res.json().catch(() => ({}))) as R & { error?: string; bots?: unknown }
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`)
  if (out.bots) set(out as unknown as TeamSnapshot)
  return out
}

/** Mở phiên chat với bot: phiên gần nhất, hoặc phiên mới khi `fresh`. Trả mã phiên. */
export async function openBotSession(id: string, fresh = false): Promise<string> {
  return (await teamAction<{ sessionId: string }>({ op: 'open', id, fresh })).sessionId
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  if (!snap) void refreshTeam()
  timer ??= setInterval(() => void refreshTeam(), 30_000)
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export function useTeamData(): TeamSnapshot | null {
  return useSyncExternalStore(subscribe, () => snap)
}

export const toMember = (b: BotData): TeamMember => ({
  id: b.id,
  name: b.name,
  role: b.role,
  note: b.role,
  status: 'idle',
  mascot: b.mascot,
  handle: b.handle,
})

export interface TeamView {
  /** Đã tải xong từ máy chủ. */
  ready: boolean
  commander: TeamMember
  /** Phòng ban theo thứ tự; bot chưa vào phòng nào ở nhóm cuối (`id` rỗng). */
  groups: TeamGroup[]
  /** Mọi bot trừ Commander. */
  members: TeamMember[]
  bots: BotData[]
  departments: DepartmentData[]
  templates: TemplateData[]
  catalog: CatalogGroup[]
  roles: RolePreset[]
}

/** Gom đội theo phòng ban, dạng các thành phần hiện có đang dùng. */
export function teamView(d: TeamSnapshot | null, noDepartment = ''): TeamView {
  if (!d)
    return {
      ready: false,
      commander: COMMANDER,
      groups: [],
      members: [],
      bots: [],
      departments: [],
      templates: [],
      catalog: [],
      roles: [],
    }
  const cmd = d.bots.find((b) => b.kind === 'commander')
  const others = d.bots.filter((b) => b.kind !== 'commander')
  const groups: TeamGroup[] = d.departments
    .map((dep) => ({
      id: dep.id,
      label: dep.name,
      lead: dep.lead ?? '',
      members: others.filter((b) => b.department === dep.id).map(toMember),
    }))
    .filter((g) => g.members.length > 0)
  const loose = others.filter((b) => !b.department || !d.departments.some((x) => x.id === b.department))
  if (loose.length) groups.push({ id: '', label: noDepartment, lead: '', members: loose.map(toMember) })
  return {
    ready: true,
    commander: cmd ? { ...toMember(cmd), note: cmd.role } : COMMANDER,
    groups,
    members: groups.flatMap((g) => g.members),
    bots: d.bots,
    departments: d.departments,
    templates: d.templates,
    catalog: d.catalog ?? [],
    roles: d.roles ?? [],
  }
}

/** Đội đang có (không theo dõi thay đổi): cho hàm tra tên ngoài React. */
export function currentTeam(noDepartment = ''): TeamView {
  return teamView(snap, noDepartment)
}

const sessionBots = new Map<string, string>()
const pendingSessions = new Set<string>()

/**
 * Bot của một phiên (phiên chưa gắn là Commander). Tải một lần mỗi phiên; phiên mở từ bot nào
 * thì gắn trước khi web mở nó nên không cần tải lại.
 */
export function useSessionBot(sessionId: string | undefined): BotData | undefined {
  const data = useTeamData()
  const id = sessionId ? sessionBots.get(sessionId) : undefined
  if (sessionId && id === undefined && !pendingSessions.has(sessionId)) {
    pendingSessions.add(sessionId)
    const url = endpoint()
    url.searchParams.set('session', sessionId)
    void fetch(url, { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<{ bot?: string }>) : undefined))
      .then((b) => {
        if (b?.bot) sessionBots.set(sessionId, b.bot)
        if (snap) set({ ...snap })
      })
      .catch(() => {})
      .finally(() => pendingSessions.delete(sessionId))
  }
  return data?.bots.find((b) => b.id === id) ?? data?.bots.find((b) => b.kind === 'commander')
}

export function useTeam(noDepartment = ''): TeamView {
  return teamView(useTeamData(), noDepartment)
}
