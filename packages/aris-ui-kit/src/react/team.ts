/**
 * Đội bot thật từ `/api/aris/bots` (gói `@aris/bots`), dùng chung cho thanh bên, cột phải và các
 * trang. Mỗi gói client đóng gói một bản module này nên mỗi gói tự tải và giữ bản sao; sửa đội ở
 * đâu thì gói đó tải lại ngay, các gói khác thấy sau lần tải định kỳ.
 */
import { useSyncExternalStore } from 'react'
import { COMMANDER, type TeamGroup, type TeamMember } from '../demo.js'
import type { BotStatus } from '../status.js'

export interface BotData {
  id: string
  kind: 'commander' | 'member'
  handle: string
  name: string
  role: string
  description: string
  soul: string
  mascot: string
  /** Mã phụ kiện linh vật hoặc `'none'`; không có là phụ kiện mặc định của dáng. */
  accessory?: string
  model?: { provider: string; model: string }
  department?: string
  /** Bot ngoài (Claude Code, Codex, ACP). */
  external?: ExternalData
  /** Bộ công cụ riêng (không có trường nào là theo chính sách phòng). */
  tools?: { web?: boolean; files?: boolean; shell?: boolean }
  /** Quyền riêng: ghi tệp, thao tác cần duyệt. */
  perms?: { write?: 'none' | 'workspace' | 'anywhere'; danger?: 'ask' | 'deny' }
  /** Model theo việc: khi chạy /goal, dự phòng riêng khi lỗi. */
  models?: { goal?: { provider: string; model: string }; fallback?: { provider: string; model: string } }
  /** Phiên bản tính cách hiện tại và lần sửa cuối. */
  soulMeta?: { version: number; at: string }
  /** Commander được giao việc (bot thường); không có là có. */
  assignable?: boolean
  createdAt: string
}

/** Kết nối nền tảng (máy chủ MCP) của một bot, bản vẽ 2.2c. Không có giá trị khoá. */
export interface McpData {
  id: string
  bot: string
  name: string
  serverName: string
  preset: 'github' | 'lark' | 'notion' | 'browser' | 'custom'
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  url?: string
  /** Tên các khoá đã lưu. */
  secretKeys: string[]
  ask: 'write' | 'always' | 'never'
  enabled: boolean
  /** Kết nối dùng chung của đội (`bot` là `TEAM_MCP_OWNER`): bot nào được dùng. */
  scope?: { bots: 'all' | string[]; departments?: string[] }
  /** Máy chủ nhập từ Claude Code hay Codex (chỉ để hiện nhãn). */
  from?: 'claude-code' | 'codex'
  /** Bot tắt riêng kết nối dùng chung này. */
  off?: string[]
  /** Mức hỏi riêng của bot (chỉ chặt hơn mức chung). */
  botAsk?: Record<string, 'write' | 'always' | 'never'>
  check?: { ok: boolean; at: string; error?: string; tools: { name: string; readOnly: boolean }[] }
  createdAt: string
}

/** Chủ của kết nối dùng chung (như `TEAM_OWNER` của `@aris/bots`). */
export const TEAM_MCP_OWNER = '_doi'

export const isTeamMcp = (c: Pick<McpData, 'bot'>) => c.bot === TEAM_MCP_OWNER

/** Bot có nằm trong phạm vi của kết nối dùng chung không (chưa xét bot tự tắt). */
export function mcpInScope(c: McpData, bot: Pick<BotData, 'id' | 'department'>): boolean {
  if (!isTeamMcp(c) || !c.scope) return false
  if (c.scope.bots === 'all' || c.scope.bots.includes(bot.id)) return true
  return !!bot.department && !!c.scope.departments?.includes(bot.department)
}

/** Kết nối dùng chung của đội mà một bot được dùng (kể cả cái bot đã tắt riêng, để hiện công tắc). */
export const teamMcpOf = (list: readonly McpData[], bot: Pick<BotData, 'id' | 'department'>): McpData[] =>
  list.filter((c) => mcpInScope(c, bot))

/** Mức hỏi chặt hơn trong hai mức. */
export const stricterMcpAsk = (a: McpData['ask'], b: McpData['ask']): McpData['ask'] => {
  const rank = { never: 0, write: 1, always: 2 }
  return rank[a] >= rank[b] ? a : b
}

/** Phạm vi viết ngắn cho một dòng: "Cả đội", tên phòng, hay "N bot". */
export function mcpScopeLabel(
  c: McpData,
  departments: readonly { id: string; name: string }[],
  labels: { all: string; bots: (n: number) => string },
): string {
  const s = c.scope
  if (!s || s.bots === 'all') return labels.all
  const deps = (s.departments ?? []).map((id) => departments.find((d) => d.id === id)?.name ?? id)
  if (s.bots.length === 0 && deps.length === 1) return deps[0]!
  return [...deps, ...(s.bots.length ? [labels.bots(s.bots.length)] : [])].join(' + ')
}

export type ExternalAgent = 'claude-code' | 'codex' | 'acp'

/** Cấu hình bot ngoài (`@aris/bots`, bản vẽ 2.1b). */
export interface ExternalData {
  agent: ExternalAgent
  permission: string
  model?: string
  timeoutMin: number
  worktree: boolean
  assignable: boolean
  budgetUsd?: number
  command?: string
  args?: string[]
}

/** Chính sách chung của phòng ban (bản vẽ 2.6). */
export interface PolicyData {
  model?: { provider: string; model: string }
  budgetUsd?: number
  onBudget: 'stop' | 'warn'
  web: boolean
  write: boolean
  shell: boolean
}

export interface DepartmentData {
  id: string
  name: string
  lead?: string
  about?: string
  policy?: PolicyData
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

/** Cách xưng hô với người dùng (hồ sơ do bot hỏi rồi lưu, hoặc sửa ở trang Hồ sơ). */
export interface OwnerAddress {
  name?: string
  call?: string
  self?: string
}

export interface TeamSnapshot {
  owner?: OwnerAddress
  bots: BotData[]
  departments: DepartmentData[]
  templates: TemplateData[]
  /** Model đang phục vụ, để chọn model riêng cho bot. */
  catalog?: CatalogGroup[]
  /** Vai mẫu (từ các đội mẫu) để điền sẵn khi tạo bot. */
  roles?: RolePreset[]
  /** Chi phí hôm nay theo phòng ban (USD). */
  spend?: Record<string, number>
  /** Kết nối nền tảng của mọi bot. */
  mcp?: McpData[]
}

export interface RolePreset {
  role: string
  description: string
  soul: string
  mascot: string
}

export interface BotLive {
  status: BotStatus
  task?: string
  since: number
  running: number
  /** Mã phiên đang chạy hoặc đang đợi (bot ngoài: mã lần chạy), đang chạy trước. */
  sessions?: string[]
}

export interface ActivityItem {
  bot: string
  kind: 'assigned' | 'started' | 'done' | 'failed' | 'waiting'
  task?: string
  /** Mã phiên của việc (bot ngoài: mã lần chạy). */
  session?: string
  at: number
}

export interface TeamLive {
  status: Record<string, BotLive>
  activity: ActivityItem[]
  /** Tên các phiên đang chạy hay đang đợi, theo mã phiên (phiên chưa có tên thì không có). */
  titles?: Record<string, string>
}

const endpoint = () => new URL('api/aris/bots', document.baseURI)
let snap: TeamSnapshot | null = null
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined
let loading: Promise<void> | undefined

/** Sự kiện trên `window` báo đội vừa đổi: mỗi gói client giữ bản đội riêng, nghe nhau qua đây. */
const CHANGED = 'aris:team-changed'

function set(next: TeamSnapshot) {
  snap = next
  for (const l of listeners) l()
}

let listening = false
function listenOthers() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener(CHANGED, (e) => {
    const next = (e as CustomEvent<TeamSnapshot>).detail
    if (next && next !== snap) set(next)
  })
}

/** Tải lại đội (sau khi sửa ở nơi khác hoặc định kỳ). */
export function refreshTeam(): Promise<void> {
  // Ngoài trình duyệt (kiểm thử): không có máy chủ để tải.
  if (typeof document === 'undefined') return Promise.resolve()
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
  if (out.bots) {
    set(out as unknown as TeamSnapshot)
    // Thanh bên, cột phải… (gói khác) cập nhật ngay thay vì đợi lần tải định kỳ.
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGED, { detail: snap }))
  }
  return out
}

/** Cách gọi người dùng trong chữ giao diện: theo hồ sơ, chưa có thì trung tính ("bạn"). */
export function youWord(o: OwnerAddress | undefined): string {
  return o?.call?.trim() || 'bạn'
}

const cap = (w: string) => w.charAt(0).toLocaleUpperCase('vi') + w.slice(1)

/** Điền `{you}` / `{You}` trong bộ chữ tiếng Việt bằng cách gọi người dùng. */
export function personalize(dict: Readonly<Record<string, string>>, o: OwnerAddress | undefined) {
  const you = youWord(o)
  return Object.fromEntries(
    Object.entries(dict).map(([k, v]) => [k, v.replaceAll('{you}', you).replaceAll('{You}', cap(you))]),
  )
}

/**
 * Đăng ký bộ chữ có `{you}`: điền theo hồ sơ xưng hô, đăng ký lại khi hồ sơ đổi. Không viết cứng
 * "anh", "chị", "chủ nhân" trong chữ giao diện.
 */
export function registerPersonal(
  locale: { register(ns: string, lang: string, dict: Record<string, string>): () => void },
  ns: string,
  lang: string,
  dict: Readonly<Record<string, string>>,
): () => void {
  let you = youWord(snap?.owner)
  let dispose = locale.register(ns, lang, personalize(dict, snap?.owner))
  const off = subscribe(() => {
    const next = youWord(snap?.owner)
    if (next === you) return
    you = next
    dispose()
    dispose = locale.register(ns, lang, personalize(dict, snap?.owner))
  })
  return () => {
    off()
    dispose()
  }
}

/** Mở phiên chat với bot: phiên gần nhất, hoặc phiên mới khi `fresh`. Trả mã phiên. */
export async function openBotSession(id: string, fresh = false): Promise<string> {
  return (await teamAction<{ sessionId: string }>({ op: 'open', id, fresh })).sessionId
}

/** Phiên gần nhất của Aris trong các ứng viên (mới nhất trước); không có thì undefined. */
export async function latestCommanderSession(candidates: readonly string[]): Promise<string | undefined> {
  if (candidates.length === 0) return undefined
  const r = await teamAction<{ sessionId: string | null }>({ op: 'commander-latest', candidates })
  return r.sessionId ?? undefined
}

function subscribe(fn: () => void) {
  listenOthers()
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

// Trạng thái trực tiếp: tải lại vài giây một lần khi có thành phần đang hiện.
let live: TeamLive | null = null
const liveListeners = new Set<() => void>()
let liveTimer: ReturnType<typeof setInterval> | undefined

function loadLive() {
  const url = endpoint()
  url.searchParams.set('live', '1')
  void fetch(url, { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<TeamLive>) : undefined))
    .then((d) => {
      if (!d) return
      live = d
      for (const l of liveListeners) l()
    })
    .catch(() => {})
}

function subscribeLive(fn: () => void) {
  liveListeners.add(fn)
  if (!live) loadLive()
  liveTimer ??= setInterval(loadLive, 4000)
  return () => {
    liveListeners.delete(fn)
    if (liveListeners.size === 0 && liveTimer) {
      clearInterval(liveTimer)
      liveTimer = undefined
    }
  }
}

export function useTeamLive(): TeamLive | null {
  return useSyncExternalStore(subscribeLive, () => live)
}

export const toMember = (b: BotData, l?: BotLive): TeamMember => ({
  id: b.id,
  name: b.name,
  role: b.role,
  // Dòng phụ: việc đang làm (khi biết), không thì vai.
  note: l && l.status !== 'idle' && l.task ? l.task : b.role,
  status: l?.status ?? 'idle',
  mascot: b.mascot,
  accessory: b.accessory,
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
  /** Cách xưng hô với người dùng. */
  owner: OwnerAddress
  /** Chi phí hôm nay theo phòng ban (USD). */
  spend: Record<string, number>
  mcp: McpData[]
}

/** Gom đội theo phòng ban, dạng các thành phần hiện có đang dùng. */
export function teamView(d: TeamSnapshot | null, noDepartment = '', l: TeamLive | null = null): TeamView {
  const m = (b: BotData) => toMember(b, l?.status[b.id])
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
      owner: {},
      spend: {},
      mcp: [],
    }
  const cmd = d.bots.find((b) => b.kind === 'commander')
  const others = d.bots.filter((b) => b.kind !== 'commander')
  const groups: TeamGroup[] = d.departments.map((dep) => ({
    id: dep.id,
    label: dep.name,
    lead: dep.lead ?? '',
    members: others.filter((b) => b.department === dep.id).map(m),
  }))
  const loose = others.filter((b) => !b.department || !d.departments.some((x) => x.id === b.department))
  if (loose.length) groups.push({ id: '', label: noDepartment, lead: '', members: loose.map(m) })
  return {
    ready: true,
    commander: cmd ? m(cmd) : COMMANDER,
    groups,
    members: groups.flatMap((g) => g.members),
    bots: d.bots,
    departments: d.departments,
    templates: d.templates,
    catalog: d.catalog ?? [],
    roles: d.roles ?? [],
    owner: d.owner ?? {},
    spend: d.spend ?? {},
    mcp: d.mcp ?? [],
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

/** Đội kèm trạng thái trực tiếp (tải lại vài giây một lần khi đang hiện). */
export function useTeam(noDepartment = ''): TeamView {
  return teamView(useTeamData(), noDepartment, useTeamLive())
}
