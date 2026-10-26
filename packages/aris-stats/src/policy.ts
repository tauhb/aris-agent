/**
 * Thống kê và nhật ký (giai đoạn 7, đợt 7c; bản vẽ 6.5 và 6.5b): phân loại việc và nguồn lúc ghi, gộp số theo ngày
 * và phiên, dựng các bước phát lại từ log phiên của dsh. Thuần, không đụng kho dữ liệu.
 */
import {
  KINDS,
  type CallRecord,
  type EventRecord,
  type Kind,
  type SessionRecord,
  type Source,
} from './domain.js'

/** Giữ từng lần gọi bấy nhiêu ngày. */
export const CALL_DAYS = 30
/** Giữ tổng theo phiên và ngày bấy nhiêu ngày (đủ cho khoảng 30 ngày và so sánh). */
export const SESSION_DAYS = 90
/** Giữ sự kiện duyệt, hỏi bấy nhiêu ngày. */
export const EVENT_DAYS = 30
/** Số dòng tối đa của nhật ký phiên. */
export const LOG_LIMIT = 100
/** Một bước phát lại dài hơn thế này thì cắt; "Xem đủ" lấy lại đủ. */
export const STEP_CHARS = 4000
/** Trần chữ khi lấy đủ một bước. */
export const FULL_CHARS = 400_000

export type Range = 'today' | '7d' | '30d'
export const RANGES: readonly Range[] = ['today', '7d', '30d']
const RANGE_DAYS: Record<Range, number> = { today: 1, '7d': 7, '30d': 30 }

export const parseRange = (v: string | null | undefined): Range => RANGES.find((r) => r === v) ?? '7d'

const two = (n: number) => String(n).padStart(2, '0')

/** Ngày theo giờ máy, dạng `2026-10-26` (cùng cách tính với sổ chi phí của @aris/providers). */
export const dayKey = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

/** Các ngày của một khoảng, cũ trước, ngày cuối là hôm nay; ngày cũ nhất cũng cho mốc bắt đầu. */
export function rangeDays(range: Range, now = Date.now()): { days: string[]; since: number } {
  const n = RANGE_DAYS[range]
  const today = new Date(now)
  const days: string[] = []
  let since = now
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    if (i === n - 1) since = d.getTime()
    days.push(dayKey(d.getTime()))
  }
  return { days, since }
}

/** Khoá bản ghi tổng theo phiên: `<ngày>-<mã phiên đã thay ký tự lạ bằng ->` (gom ngoài phiên: `<ngày>-~nen`). */
export const sessionKey = (day: string, session: string, pseudo = 'nen'): string =>
  `${day}-${session ? session.replace(/[^A-Za-z0-9-]/g, '-') : `~${pseudo}`}`

// --- Phân loại -----------------------------------------------------------------------------------------

/** Những gì biết về một phiên lúc ghi (lấy từ các dịch vụ của aris, xem `index.ts`). */
export interface Facts {
  routine?: boolean
  /** Phiên của Thủ thư (nạp, hỏi bộ não). */
  librarian?: boolean
  /** Phiên kiểm thử skill. */
  eval?: boolean
  /** Phiên khách của ứng dụng khác (ACP). */
  guest?: boolean
  /** Cách phiên được gắn với bot: `open`, `team`, `dispatch`, `acp`. */
  via?: string | undefined
  /** Phiên có phiên cha (tách ra từ phiên khác). */
  parent?: boolean
  /** Phiên của một cuộc trò chuyện Telegram. */
  channel?: boolean
}

/**
 * Loại việc và nguồn của một phiên. Thứ tự: routine, vòng học và kiểm thử, ứng dụng khác, việc Commander giao,
 * việc bot khác giao (đội hay phiên cha), Telegram, còn lại là chat ở web.
 */
export function classify(f: Facts): { kind: Kind; source: Source } {
  if (f.routine) return { kind: 'routine', source: 'lich' }
  if (f.librarian || f.eval) return { kind: 'hoc', source: 'nen' }
  if (f.guest) return { kind: 'giao', source: 'app' }
  if (f.via === 'dispatch') return { kind: 'giao', source: 'commander' }
  if (f.via === 'team' || f.parent) return { kind: 'giao', source: 'giao' }
  if (f.channel) return { kind: 'chat', source: 'telegram' }
  return { kind: 'chat', source: 'web' }
}

/** Phạm vi chi phí của các việc nền ngoài phiên (vòng học, hồ sơ). */
const LEARNING_SCOPES = new Set(['reflect', 'profile'])

/** Lần gọi ngoài phiên: vòng học nền thì là `hoc`, còn lại tính là chat. */
export function classifyNoSession(scope: readonly string[]): { kind: Kind; source: Source } {
  return scope.some((s) => LEARNING_SCOPES.has(s))
    ? { kind: 'hoc', source: 'nen' }
    : { kind: 'chat', source: 'web' }
}

/** Phân loại mới chỉ thay cũ khi cụ thể hơn: đã là việc nền thì không tụt về chat vì tag đến chậm. */
export const keepSpecific = (
  prev: { kind: Kind; source: Source } | undefined,
  next: { kind: Kind; source: Source },
): { kind: Kind; source: Source } => (prev && prev.kind !== 'chat' && next.kind === 'chat' ? prev : next)

// --- Gộp số --------------------------------------------------------------------------------------------

export interface PriceLike {
  input: number
  cacheRead: number
}

/** Tiền tiết kiệm nhờ cache và tiền đầu vào nếu không có cache, tính theo giá model (không có giá: 0). */
export function cacheSavings(
  price: PriceLike | undefined,
  u: { input: number; cacheRead: number; cacheWrite: number },
): { saveUsd: number; fullInUsd: number } {
  if (!price || !(price.input > 0)) return { saveUsd: 0, fullInUsd: 0 }
  return {
    saveUsd: (u.cacheRead * Math.max(0, price.input - price.cacheRead)) / 1_000_000,
    fullInUsd: ((u.input + u.cacheRead + u.cacheWrite) * price.input) / 1_000_000,
  }
}

export interface CallFacts {
  at: number
  session: string
  bot: string
  kind: Kind
  source: Source
  by?: string | undefined
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  usd: number
  saveUsd: number
  fullInUsd: number
}

/** Cộng một lần gọi vào bản ghi tổng của (ngày, phiên). `asked` giữ nguyên. */
export function addCall(prev: SessionRecord | undefined, c: CallFacts): SessionRecord {
  return {
    day: prev?.day ?? dayKey(c.at),
    session: c.session,
    bot: c.bot || prev?.bot || '',
    kind: c.kind,
    source: c.source,
    ...((c.by ?? prev?.by) ? { by: (c.by ?? prev?.by)! } : {}),
    firstAt: Math.min(prev?.firstAt ?? c.at, c.at),
    lastAt: Math.max(prev?.lastAt ?? c.at, c.at),
    calls: (prev?.calls ?? 0) + 1,
    input: (prev?.input ?? 0) + c.input,
    output: (prev?.output ?? 0) + c.output,
    cacheRead: (prev?.cacheRead ?? 0) + c.cacheRead,
    cacheWrite: (prev?.cacheWrite ?? 0) + c.cacheWrite,
    usd: (prev?.usd ?? 0) + c.usd,
    saveUsd: (prev?.saveUsd ?? 0) + c.saveUsd,
    fullInUsd: (prev?.fullInUsd ?? 0) + c.fullInUsd,
    asked: prev?.asked ?? false,
  }
}

/** Token của một bản ghi: đầu vào (kể cả cache) cộng đầu ra. */
export const tokensOf = (r: Pick<SessionRecord, 'input' | 'output' | 'cacheRead' | 'cacheWrite'>) =>
  r.input + r.output + r.cacheRead + r.cacheWrite

export interface LogRow {
  session: string
  bot: string
  by: string
  kind: Kind
  source: Source
  firstAt: number
  lastAt: number
  usd: number
  tokens: number
}

export interface Overview {
  range: Range
  total: number
  /** Tổng token trong khoảng (đầu vào kể cả cache, cộng đầu ra), kể cả phần gom ngoài phiên. */
  tokens: number
  days: ({ day: string } & Record<Kind, number>)[]
  cache: { pct: number | null; savePct: number | null }
  autonomous: { done: number; total: number }
  log: LogRow[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Số liệu của một khoảng từ các bản ghi tổng theo phiên và ngày:
 * - `days`: USD mỗi ngày theo bốn loại việc, đủ số ngày (ngày trống là 0);
 * - `cache.pct`: phần token đầu vào đọc từ cache = cacheRead / (input + cacheRead + cacheWrite), vì `input` của dsh
 *   là phần chưa qua cache (các số token rời nhau); `cache.savePct`: tiền tiết kiệm / tiền đầu vào nếu không có
 *   cache, chỉ tính model có giá, không có thì null;
 * - `autonomous`: `total` là số bản ghi (ngày, phiên) có ít nhất một lần gọi, `done` là số bản không phải hỏi
 *   người dùng;
 * - `log`: mỗi phiên một dòng gộp các ngày trong khoảng, mới nhất trước, tối đa `LOG_LIMIT` dòng.
 */
export function overview(records: Iterable<SessionRecord>, range: Range, now = Date.now()): Overview {
  const { days } = rangeDays(range, now)
  const perDay = new Map(days.map((day) => [day, { day, chat: 0, giao: 0, routine: 0, hoc: 0 }]))
  const sum = { input: 0, cacheRead: 0, cacheWrite: 0, saveUsd: 0, fullInUsd: 0 }
  const autonomous = { done: 0, total: 0 }
  const bySession = new Map<string, LogRow>()
  let total = 0
  let tokens = 0
  for (const r of records) {
    const d = perDay.get(r.day)
    if (!d) continue
    d[r.kind] += r.usd
    total += r.usd
    tokens += tokensOf(r)
    sum.input += r.input
    sum.cacheRead += r.cacheRead
    sum.cacheWrite += r.cacheWrite
    sum.saveUsd += r.saveUsd
    sum.fullInUsd += r.fullInUsd
    // Gom ngoài phiên và bản ghi tạm (mới có dấu đã hỏi, chưa có lần gọi nào) không phải việc để đếm hay liệt kê.
    if (!r.session || r.calls === 0) continue
    autonomous.total++
    if (!r.asked) autonomous.done++
    const row = bySession.get(r.session)
    if (!row) {
      bySession.set(r.session, {
        session: r.session,
        bot: r.bot,
        by: r.by ?? '',
        kind: r.kind,
        source: r.source,
        firstAt: r.firstAt,
        lastAt: r.lastAt,
        usd: r.usd,
        tokens: tokensOf(r),
      })
      continue
    }
    row.usd += r.usd
    row.tokens += tokensOf(r)
    row.firstAt = Math.min(row.firstAt, r.firstAt)
    if (r.lastAt >= row.lastAt) {
      row.lastAt = r.lastAt
      row.bot = r.bot || row.bot
      row.by = r.by ?? row.by
      row.kind = r.kind
      row.source = r.source
    }
  }
  const allIn = sum.input + sum.cacheRead + sum.cacheWrite
  return {
    range,
    total,
    tokens,
    days: days.map((day) => perDay.get(day)!),
    cache: {
      pct: allIn > 0 ? round1((sum.cacheRead / allIn) * 100) : null,
      savePct: sum.fullInUsd > 0 ? round1((sum.saveUsd / sum.fullInUsd) * 100) : null,
    },
    autonomous,
    log: [...bySession.values()].sort((a, z) => z.lastAt - a.lastAt).slice(0, LOG_LIMIT),
  }
}

/** Một dòng của bảng "Chi phí theo model": gộp mọi lần gọi của một model trong khoảng. */
export interface ModelRow {
  provider: string
  model: string
  calls: number
  /** Token đầu vào (kể cả cache) cộng đầu ra. */
  tokens: number
  /** Phần token đầu vào đọc từ cache (%), null khi không có token đầu vào. */
  cachePct: number | null
  usd: number
}

/**
 * Chi phí theo model trong khoảng, từ bảng `calls` (từng lần gọi, giữ `CALL_DAYS` ngày). Lần gọi ngoài khoảng bị bỏ;
 * model nhiều tiền nhất đứng đầu, bằng nhau thì nhiều lần gọi hơn đứng trước.
 */
export function byModel(calls: Iterable<CallRecord>, range: Range, now = Date.now()): ModelRow[] {
  const inRange = new Set(rangeDays(range, now).days)
  const sums = new Map<string, ModelRow & { allIn: number; cacheRead: number }>()
  for (const c of calls) {
    if (!inRange.has(c.day)) continue
    const key = `${c.provider}\u0000${c.model}`
    const row = sums.get(key) ?? {
      provider: c.provider,
      model: c.model,
      calls: 0,
      tokens: 0,
      cachePct: null,
      usd: 0,
      allIn: 0,
      cacheRead: 0,
    }
    row.calls++
    row.tokens += c.input + c.output + c.cacheRead + c.cacheWrite
    row.usd += c.usd
    row.allIn += c.input + c.cacheRead + c.cacheWrite
    row.cacheRead += c.cacheRead
    sums.set(key, row)
  }
  return [...sums.values()]
    .map(({ allIn, cacheRead, ...row }) => ({
      ...row,
      cachePct: allIn > 0 ? round1((cacheRead / allIn) * 100) : null,
    }))
    .sort((a, z) => z.usd - a.usd || z.calls - a.calls)
}

/** Mã các bản ghi quá hạn giữ (để dọn). */
export function expiredKeys<V>(
  entries: Iterable<[string, V]>,
  timeOf: (v: V) => number,
  days: number,
  now = Date.now(),
): string[] {
  const cut = now - days * 86_400_000
  const out: string[] = []
  for (const [k, v] of entries) if (timeOf(v) < cut) out.push(k)
  return out
}

/** Số USD tổng của từng loại trong khoảng (dùng cho nhãn trợ năng của biểu đồ). */
export const totalOfKinds = (d: Record<Kind, number>) => KINDS.reduce((n, k) => n + d[k], 0)

// --- Phát lại phiên ------------------------------------------------------------------------------------

/** Một dòng log phiên của dsh (`observeSession().events`), chỉ phần dùng tới. */
export interface LogEntry {
  type: string
  time: number
  data?: unknown
}

/** Một lần hàng rào chặn (`@aris/guard`, bảng `blocked`). */
export interface BlockedLike {
  at: string
  tool: string
  what: string
}

export type StepType = 'user' | 'assistant' | 'thinking' | 'tool' | 'duyet' | 'hoi' | 'chan'
export type InLabel = 'message' | 'content' | 'args' | 'command' | 'question'
export type OutLabel = 'result' | 'error' | 'decision' | 'rule' | 'answer'

export interface Step {
  n: number
  at: number
  type: StepType
  title: string
  tool?: string
  /** Công cụ báo lỗi. */
  error?: boolean
  provider?: string
  model?: string
  /** Token vào của lần gọi model sinh ra bước này, kể cả phần cache. */
  input?: number
  cacheRead?: number
  output?: number
  usd?: number
  /** Thời gian: model nghĩ (bước trợ lý), công cụ chạy, hay chờ duyệt (ms). */
  ms?: number
  inLabel: InLabel
  body: string
  bodyFull: boolean
  outLabel?: OutLabel
  out?: string
  outFull?: boolean
}

interface Usage {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}
interface Block {
  type?: string
  text?: string
}
interface Msg {
  content?: unknown
  source?: { kind?: string; provider?: string; model?: string; form?: string }
  toolCallId?: string
  isError?: boolean
}

/** Tin nhắn người dùng chỉ là ngữ cảnh dsh hay aris chèn vào cho model, không phải việc để hiện. */
const CONTEXT_USER_KINDS = new Set([
  'model-selection',
  'runtime-context',
  'working-directory',
  'user-approval',
  'ptc-mode',
  'tool-registry',
  'plan-mode',
  'cordis-host-runner',
])

const blocksOf = (content: unknown): Block[] =>
  typeof content === 'string'
    ? [{ type: 'text', text: content }]
    : Array.isArray(content)
      ? (content as Block[])
      : []

/** Chữ của các khối `type` (mặc định `text`); ảnh, tệp thành `[image]`, `[file]` khi lấy chữ thường. */
function textOf(content: unknown, type = 'text'): string {
  const parts: string[] = []
  for (const b of blocksOf(content)) {
    if (b?.type === type && typeof b.text === 'string') parts.push(b.text)
    else if (type === 'text' && (b?.type === 'image' || b?.type === 'file')) parts.push(`[${b.type}]`)
  }
  return parts.join('\n')
}

/** Một dòng gọn: gộp khoảng trắng, cắt bằng dấu … khi dài. */
export function oneLine(s: string, max = 160): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Cắt chữ dài; `full` cho biết có còn đủ không. */
export const cutText = (s: string, max: number): { text: string; full: boolean } =>
  s.length > max ? { text: s.slice(0, max), full: false } : { text: s, full: true }

const SUMMARY_KEYS = [
  'command',
  'cmd',
  'query',
  'url',
  'file_path',
  'path',
  'pattern',
  'title',
  'question',
  'text',
  'prompt',
  'to',
  'name',
  'id',
]

/** Mô tả ngắn một lời gọi công cụ từ tham số (lệnh, truy vấn, URL, đường dẫn, câu hỏi…). */
export function describeCall(tool: string, args: unknown): string {
  const parsed = typeof args === 'string' ? parseJson(args) : args
  if (typeof args === 'string' && parsed === undefined) return oneLine(args, 140)
  const a = parsed as Record<string, unknown> | string | undefined
  if (typeof a === 'string') return oneLine(a, 140)
  if (!a || typeof a !== 'object') return ''
  const qs = a.questions
  if (tool === 'ask_user_question' && Array.isArray(qs)) {
    const q = (qs[0] as { question?: unknown } | undefined)?.question
    if (typeof q === 'string') return oneLine(q, 140)
  }
  for (const k of SUMMARY_KEYS) {
    const v = a[k]
    if (typeof v === 'string' && v.trim()) return oneLine(v, 140)
  }
  for (const v of Object.values(a)) if (typeof v === 'string' && v.trim()) return oneLine(v, 140)
  const json = JSON.stringify(a)
  return json === '{}' ? '' : oneLine(json, 140)
}

function parseJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

const toolTitle = (tool: string, args: unknown) => oneLine(`${tool} ${describeCall(tool, args)}`.trim(), 160)

/** Tham số hiện đẹp: JSON thụt đầu dòng, hỏng thì giữ nguyên chữ gốc. */
function prettyArgs(raw: string): string {
  const v = parseJson(raw)
  return v !== undefined && typeof v === 'object' ? JSON.stringify(v, null, 2) : raw
}

interface Draft extends Step {
  callId?: string
  /** Lần gọi model sinh bước này, chờ ghép tiền. */
  usage?: { input: number; cacheRead: number; cacheWrite: number; output: number }
  /** Thời điểm kết thúc, để ghép với bản ghi chặn. */
  endAt?: number
}

export interface BuildOptions {
  /** Cắt `body` và `out` ở bấy nhiêu ký tự (mặc định `STEP_CHARS`). */
  limit?: number
  /** Tính tiền khi không ghép được lần gọi đã ghi (phiên có trước khi có thống kê). */
  cost?: (
    provider: string,
    model: string,
    u: { input: number; cacheRead: number; cacheWrite: number; output: number },
  ) => number | undefined
}

/**
 * Dựng các bước phát lại từ log phiên của dsh:
 * - tin người dùng, suy nghĩ, trả lời (mỗi tin trợ lý tách suy nghĩ và chữ), gọi công cụ ghép với kết quả theo
 *   `callId` thành một bước;
 * - token lấy từ `usage` của tin trợ lý, gắn vào bước đầu tiên sinh ra từ lần gọi model đó; tiền ghép với bản
 *   ghi `calls` theo thứ tự (cùng số token), không có thì tính theo giá nếu có `cost`;
 * - bước duyệt: log phiên (`approval/asked`, `approval/decided`) hợp với bản ghi `events` theo `callId` (hay
 *   công cụ và thời gian), đứng ngay trước bước công cụ của nó;
 * - bước bị chặn: bản ghi của hàng rào đánh dấu bước công cụ trùng tên và thời gian, không có thì thêm bước riêng;
 * - hỏi người dùng: lời gọi `ask_user_question`, thời gian là lúc chờ trả lời.
 */
export function buildSteps(
  entries: readonly LogEntry[],
  calls: readonly CallRecord[],
  events: readonly EventRecord[],
  blocked: readonly BlockedLike[],
  opts: BuildOptions = {},
): Step[] {
  const limit = opts.limit ?? STEP_CHARS
  const steps: Draft[] = []
  const byCall = new Map<string, Draft>()
  const startOf = new Map<string, number>()
  const asked = new Map<
    string,
    { id: string; tool: string; callId?: string; at: number; decidedAt?: number; outcome?: string }
  >()
  let holder:
    | {
        usage: NonNullable<Draft['usage']>
        provider: string
        model: string
        ms?: number
        turn: number
        step: number
      }
    | undefined

  const give = (d: Draft) => {
    if (!holder) return
    Object.assign(d, {
      provider: holder.provider,
      model: holder.model,
      usage: holder.usage,
      input: holder.usage.input + holder.usage.cacheRead + holder.usage.cacheWrite,
      cacheRead: holder.usage.cacheRead,
      output: holder.usage.output,
      ...(holder.ms !== undefined ? { ms: holder.ms } : {}),
    })
    holder = undefined
  }

  for (const e of entries) {
    const data = (e.data ?? {}) as Record<string, unknown>
    switch (e.type) {
      case 'step/start':
        startOf.set(`${data.turn}:${data.step}`, e.time)
        break
      case 'user/message': {
        const m = data as unknown as Msg
        const kind = m.source?.kind
        if (m.source?.form || (kind && CONTEXT_USER_KINDS.has(kind))) break
        const text = textOf(m.content)
        if (!text.trim()) break
        steps.push({
          n: 0,
          at: e.time,
          type: 'user',
          title: oneLine(text),
          inLabel: 'message',
          body: text,
          bodyFull: true,
        })
        break
      }
      case 'assistant/message': {
        const m = data.message as Msg | undefined
        const u = data.usage as Usage | undefined
        const turn = Number(data.turn)
        const stepNo = Number(data.step)
        const started = startOf.get(`${turn}:${stepNo}`)
        holder = u
          ? {
              usage: {
                input: u.inputTokens ?? 0,
                output: u.outputTokens ?? 0,
                cacheRead: u.cacheReadTokens ?? 0,
                cacheWrite: u.cacheWriteTokens ?? 0,
              },
              provider: m?.source?.provider ?? '',
              model: m?.source?.model ?? '',
              ...(started !== undefined ? { ms: Math.max(0, e.time - started) } : {}),
              turn,
              step: stepNo,
            }
          : undefined
        const thinking = textOf(m?.content, 'reasoning')
        const text = textOf(m?.content)
        for (const [type, body] of [
          ['thinking', thinking],
          ['assistant', text],
        ] as const) {
          if (!body.trim()) continue
          const d: Draft = {
            n: 0,
            at: e.time,
            type,
            title: oneLine(body),
            inLabel: 'content',
            body,
            bodyFull: true,
          }
          give(d)
          steps.push(d)
        }
        break
      }
      case 'tool/call': {
        const name = String(data.name ?? '')
        const raw = typeof data.arguments === 'string' ? data.arguments : JSON.stringify(data.arguments ?? {})
        const args = parseJson(raw) ?? raw
        const asking = name === 'ask_user_question'
        const bash =
          (name === 'bash' || name === 'pwsh') && typeof (args as { command?: unknown })?.command === 'string'
        const d: Draft = {
          n: 0,
          at: e.time,
          type: asking ? 'hoi' : 'tool',
          title: toolTitle(name, args),
          tool: name,
          callId: String(data.callId ?? ''),
          inLabel: asking ? 'question' : bash ? 'command' : 'args',
          body: bash
            ? (args as { command: string }).command
            : asking
              ? describeCall(name, args)
              : prettyArgs(raw),
          bodyFull: true,
        }
        if (holder && holder.turn === Number(data.turn) && holder.step === Number(data.step)) give(d)
        steps.push(d)
        if (d.callId) byCall.set(d.callId, d)
        break
      }
      case 'tool/result': {
        const m = data.message as Msg | undefined
        const d = m?.toolCallId ? byCall.get(String(m.toolCallId)) : undefined
        if (!d) break
        const text = textOf(m?.content)
        d.out = text
        d.outFull = true
        d.outLabel = d.type === 'hoi' ? 'answer' : m?.isError ? 'error' : 'result'
        if (m?.isError) d.error = true
        d.ms = Math.max(0, e.time - d.at)
        d.endAt = e.time
        break
      }
      case 'approval/asked': {
        const id = String(data.id ?? '')
        asked.set(id, {
          id,
          tool: String(data.toolName ?? ''),
          ...(data.callId ? { callId: String(data.callId) } : {}),
          at: e.time,
        })
        break
      }
      case 'approval/decided': {
        const a = asked.get(String(data.id ?? ''))
        if (a) {
          a.decidedAt = e.time
          a.outcome = String(data.outcome ?? '')
        }
        break
      }
      default:
    }
  }

  // Tiền: ghép từng lần gọi model đã ghi, cùng số token, theo thứ tự.
  const paid = calls
    .filter((c) => c.input + c.output + c.cacheRead + c.cacheWrite > 0)
    .sort((a, z) => a.at - z.at)
  let ptr = 0
  for (const d of steps) {
    if (!d.usage) continue
    const u = d.usage
    const j = paid.findIndex(
      (c, i) => i >= ptr && c.input === u.input && c.output === u.output && c.cacheRead === u.cacheRead,
    )
    if (j >= 0) {
      d.usd = paid[j]!.usd
      ptr = j + 1
    } else {
      const usd = opts.cost?.(d.provider ?? '', d.model ?? '', u)
      if (usd !== undefined) d.usd = usd
    }
  }

  // Hàng rào chặn: đánh dấu bước công cụ trùng tên, gần thời điểm chặn nhất.
  const rest: Draft[] = []
  for (const b of blocked) {
    const at = Date.parse(b.at)
    const hit = steps
      .filter(
        (d) =>
          d.type === 'tool' &&
          d.tool === b.tool &&
          d.at <= at + 1000 &&
          (d.endAt === undefined || d.endAt >= at - 1000),
      )
      .at(-1)
    if (hit) {
      hit.type = 'chan'
      hit.error = true
      hit.outLabel = 'rule'
      hit.out = hit.out ? `${b.what}\n${hit.out}` : b.what
      hit.outFull = true
    } else {
      rest.push({
        n: 0,
        at,
        type: 'chan',
        title: oneLine(`${b.tool} (${b.what})`),
        tool: b.tool,
        error: true,
        inLabel: 'args',
        body: b.what,
        bodyFull: true,
      })
    }
  }

  // Duyệt: log phiên hợp với bản ghi events; hỏi chưa có bước công cụ thì thêm bước riêng.
  const table = events.filter((x) => x.type === 'duyet')
  const used = new Set<EventRecord>()
  const approvals: Draft[] = []
  for (const a of asked.values()) {
    const rec = table.find(
      (x) =>
        !used.has(x) &&
        (a.callId && x.callId ? x.callId === a.callId : x.tool === a.tool && Math.abs(x.at - a.at) <= 2000),
    )
    if (rec) used.add(rec)
    approvals.push(
      approvalStep({
        at: a.at,
        tool: a.tool,
        callId: a.callId ?? rec?.callId,
        what: rec?.what,
        decision: rec?.decision ?? a.outcome,
        waitedMs: rec?.waitedMs ?? (a.decidedAt !== undefined ? a.decidedAt - a.at : undefined),
        call: (a.callId ?? rec?.callId) ? byCall.get((a.callId ?? rec?.callId)!) : undefined,
      }),
    )
  }
  for (const x of table)
    if (!used.has(x))
      approvals.push(
        approvalStep({
          at: x.at,
          tool: x.tool ?? '',
          callId: x.callId,
          what: x.what,
          decision: x.decision,
          waitedMs: x.waitedMs,
          call: x.callId ? byCall.get(x.callId) : undefined,
        }),
      )
  for (const x of events) {
    if (x.type !== 'hoi' || (x.callId && byCall.has(x.callId))) continue
    rest.push({
      n: 0,
      at: x.at,
      type: 'hoi',
      title: oneLine(`${x.tool ?? 'ask_user_question'} ${x.what ?? ''}`),
      ...(x.tool ? { tool: x.tool } : {}),
      inLabel: 'question',
      body: x.what ?? '',
      bodyFull: true,
    })
  }

  const all: Draft[] = [...steps]
  const insertAt = (d: Draft, before?: Draft) => {
    const i = before ? all.indexOf(before) : all.findIndex((x) => x.at > d.at)
    if (i < 0) all.push(d)
    else all.splice(i, 0, d)
  }
  for (const d of approvals) insertAt(d, d.callId ? byCall.get(d.callId) : undefined)
  for (const d of rest.sort((a, z) => a.at - z.at)) insertAt(d)

  return all.map((d, i) => finish({ ...d, n: i + 1 }, limit))
}

function approvalStep(a: {
  at: number
  tool: string
  callId?: string | undefined
  what?: string | undefined
  decision?: string | undefined
  waitedMs?: number | undefined
  call?: Draft | undefined
}): Draft {
  const title = a.call?.title ?? oneLine(`${a.tool} ${a.what ?? ''}`.trim())
  return {
    n: 0,
    at: a.at,
    type: 'duyet',
    title,
    ...(a.tool ? { tool: a.tool } : {}),
    ...(a.callId ? { callId: a.callId } : {}),
    ...(a.waitedMs !== undefined ? { ms: Math.max(0, a.waitedMs) } : {}),
    inLabel: a.call ? a.call.inLabel : 'args',
    body: a.call?.body ?? a.what ?? '',
    bodyFull: true,
    ...(a.decision ? { outLabel: 'decision' as const, out: a.decision, outFull: true } : {}),
  }
}

/** Bỏ trường nội bộ, cắt chữ dài và đặt cờ đủ/không đủ. */
function finish(d: Draft, limit: number): Step {
  const step: Draft = { ...d }
  delete step.callId
  delete step.usage
  delete step.endAt
  const body = cutText(step.body, limit)
  const out = step.out === undefined ? undefined : cutText(step.out, limit)
  return {
    ...step,
    body: body.text,
    bodyFull: body.full,
    ...(out ? { out: out.text, outFull: out.full } : {}),
  }
}
