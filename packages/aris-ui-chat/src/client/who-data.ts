/**
 * Ai đang nói (bản vẽ 1.7 `AiDangNoi.dc.html`): đầu tin cho mỗi lượt trả lời, tên thành viên
 * `@tên` thành phần tử riêng, kết quả bot gửi về phiên (nguồn `aris-bot`). Thuần, không phụ thuộc React.
 */

/** Nguồn tin bot gửi về phiên giao việc (`@aris/commander`, `relay`). */
export const BOT_SOURCE = 'aris-bot'

export interface BotSource {
  kind: typeof BOT_SOURCE
  bot: string
  name: string
  run?: string
  job?: string
}

export function botSource(source: unknown): BotSource | undefined {
  const s = source as Partial<BotSource> | undefined
  return s?.kind === BOT_SOURCE && typeof s.bot === 'string' ? (s as BotSource) : undefined
}

interface EventLike {
  type: string
  seq: number
  time?: number | string
  data: unknown
}

/** Sự kiện của người trả lời trong lượt: đầu tin đứng trước cái sớm nhất. */
const REPLY_EVENTS = new Set(['assistant/live-chunk', 'assistant/message', 'tool/call'])

interface TurnHeadState {
  turn: number
  /** Số thứ tự sự kiện trả lời sớm nhất của lượt; chưa có thì chưa vẽ. */
  anchor?: number
  time?: number | string | undefined
}

/**
 * Đầu tin của lượt: một dòng ở mức lượt, nửa bậc trước sự kiện trả lời đầu tiên (chỗ dsh neo phần
 * "quá trình"), nên đứng trên cả phần quá trình lẫn câu trả lời. Ai nói thì khung chat tra theo phiên.
 */
export const turnHeadDefinition = {
  kind: 'aris-turn-head',
  target: 'chat',
  match: (event: EventLike) => {
    const turn = (event.data as { turn?: unknown } | undefined)?.turn
    if (typeof turn !== 'number') return null
    if (event.type === 'turn/start') return { id: `turn-${turn}`, role: 'start' }
    return REPLY_EVENTS.has(event.type) ? { id: `turn-${turn}`, role: 'update' } : null
  },
  start: (_context: unknown, match: { event: EventLike }): TurnHeadState => ({
    turn: (match.event.data as { turn: number }).turn,
  }),
  update: (context: { state: TurnHeadState }, match: { event: EventLike }): TurnHeadState =>
    context.state.anchor !== undefined && context.state.anchor <= match.event.seq
      ? context.state
      : { ...context.state, anchor: match.event.seq, time: match.event.time },
  buildViewNode: (context: {
    key: string
    id: string
    state?: TurnHeadState
    start?: { location?: unknown }
  }) =>
    context.state?.anchor === undefined
      ? null
      : {
          key: context.key,
          kind: 'aris-turn-head',
          id: context.id,
          target: 'chat',
          anchorSeq: context.state.anchor - 0.5,
          location: context.start?.location ?? { kind: 'unresolved' },
          visibility: 'visible',
          groupTree: 'input',
          data: { time: context.state.time },
        },
}

/**
 * Kết quả bot gửi về phiên (tin nguồn `aris-bot`): một thẻ của bot ngay trước dòng "đánh thức lượt"
 * của dsh (dòng đó ẩn bằng CSS khi đứng ngay sau thẻ này).
 */
export const botReportDefinition = {
  kind: 'aris-bot-report',
  target: 'chat',
  match: (event: EventLike) =>
    event.type === 'user/message' && botSource((event.data as { source?: unknown }).source)
      ? { id: String((event.data as { id?: unknown }).id ?? event.seq), role: 'start' }
      : null,
  start: (_context: unknown, match: { event: EventLike }) => {
    const d = match.event.data as { source: unknown; content?: unknown }
    return { seq: match.event.seq, time: match.event.time, source: d.source, text: contentText(d.content) }
  },
  update: (context: { state: unknown }) => context.state,
  buildViewNode: (context: {
    key: string
    id: string
    state?: { seq: number; time?: number | string; source: unknown; text: string }
    start?: { location?: unknown }
  }) =>
    context.state === undefined
      ? null
      : {
          key: context.key,
          kind: 'aris-bot-report',
          id: context.id,
          target: 'chat',
          anchorSeq: context.state.seq - 0.25,
          location: context.start?.location ?? { kind: 'unresolved' },
          visibility: 'visible',
          groupTree: 'turn',
          data: context.state,
        },
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((p: { type?: string; text?: unknown }) =>
      p?.type === 'text' && typeof p.text === 'string' ? [p.text] : [],
    )
    .join('\n')
}

/**
 * Tách lời báo của bot: dòng đầu là tình trạng (bỏ nhãn `[Bot ngoài · việc …]`), phần sau
 * "Kết quả của …:" là câu trả lời của bot.
 */
export function reportParts(text: string): { status: string; body: string } {
  // Báo cáo việc lớn của trưởng nhóm (`jobReport`): bỏ lời dặn Aris ở cuối.
  const job =
    /^(Phòng [^\n]* nộp kết quả việc lớn [^\n]*):\n\n([\s\S]*?)(?:\n\nTổng hợp cho người dùng:[^\n]*)?$/.exec(
      text,
    )
  if (job) return { status: job[1]!, body: job[2]!.trim() }
  const clean = text.replace(/^\[Bot ngoài · việc [^\]]+\]\s*/, '')
  const m = /\n\s*\nKết quả của [^\n:]+:\n/.exec(clean)
  return m
    ? { status: clean.slice(0, m.index).trim(), body: clean.slice(m.index + m[0].length).trim() }
    : { status: '', body: clean.trim() }
}

/** Một đoạn `@tên` khớp với bot trong đội. */
export interface MentionHit {
  start: number
  end: number
  handle: string
}

const HANDLE = /@([a-z0-9][a-z0-9-]*)/gi

/**
 * Tìm `@tên` gần nhất từ vị trí `from` mà tên là bot trong đội. Trước `@` phải là đầu chuỗi hoặc ký tự
 * không phải chữ/số (bỏ qua email), sau tên không được là chữ/số.
 */
export function findMention(
  text: string,
  from: number,
  handles: ReadonlySet<string>,
): MentionHit | undefined {
  HANDLE.lastIndex = from
  for (let m = HANDLE.exec(text); m; m = HANDLE.exec(text)) {
    const before = m.index > 0 ? text[m.index - 1]! : ''
    if (before && /[\p{L}\p{N}_.]/u.test(before)) continue
    const handle = m[1]!.toLowerCase()
    if (handles.has(handle)) return { start: m.index, end: m.index + m[0].length, handle }
  }
  return undefined
}

/** Tách chữ thành đoạn thường và `@tên` của bot trong đội. */
export function splitMentions(
  text: string,
  handles: ReadonlySet<string>,
): ({ kind: 'text'; text: string } | { kind: 'mention'; handle: string; text: string })[] {
  const out: ({ kind: 'text'; text: string } | { kind: 'mention'; handle: string; text: string })[] = []
  let at = 0
  for (let hit = findMention(text, 0, handles); hit; hit = findMention(text, hit.end, handles)) {
    if (hit.start > at) out.push({ kind: 'text', text: text.slice(at, hit.start) })
    out.push({ kind: 'mention', handle: hit.handle, text: text.slice(hit.start, hit.end) })
    at = hit.end
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) })
  return out
}

/**
 * Như {@link splitMentions}, thêm tên bot viết thẳng không có `@` (giao diện GĐ9): tên phải đứng riêng (không
 * dính chữ hay số hai bên), đúng hoa thường, ít nhất 2 ký tự. `names` là tên → tên gọi.
 */
export function splitRefs(
  text: string,
  handles: ReadonlySet<string>,
  names: ReadonlyMap<string, string>,
): ({ kind: 'text'; text: string } | { kind: 'mention'; handle: string; text: string })[] {
  const list = [...names.keys()].filter((n) => n.length >= 2).sort((a, b) => b.length - a.length)
  if (!list.length) return splitMentions(text, handles)
  const esc = list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const re = new RegExp(`(?<![\\p{L}\\p{N}_@])(?:${esc})(?![\\p{L}\\p{N}_])`, 'gu')
  const out: ({ kind: 'text'; text: string } | { kind: 'mention'; handle: string; text: string })[] = []
  for (const part of splitMentions(text, handles)) {
    if (part.kind === 'mention') {
      out.push(part)
      continue
    }
    let at = 0
    for (const m of part.text.matchAll(re)) {
      if (m.index > at) out.push({ kind: 'text', text: part.text.slice(at, m.index) })
      out.push({ kind: 'mention', handle: names.get(m[0])!, text: m[0] })
      at = m.index + m[0].length
    }
    if (at < part.text.length) out.push({ kind: 'text', text: part.text.slice(at) })
  }
  return out
}

/** Một đoạn chữ trong lời bot: thường, đậm (`**x**`), mã (`` `x` ``). */
export interface InlinePart {
  kind: 'text' | 'bold' | 'code'
  text: string
}

/** Tách chữ đậm và mã kiểu Markdown trong một dòng chữ thường (không dựng cả Markdown). */
export function inlineParts(text: string): InlinePart[] {
  const out: InlinePart[] = []
  const re = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) })
    out.push(m[1] !== undefined ? { kind: 'bold', text: m[1] } : { kind: 'code', text: m[2]! })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

/** Bản ghi chuyển giao (`@aris/commander`): câu trả lời của bot đích gửi thẳng cho người dùng. */
export const HANDOFF_RECORD = 'plugin:aris/handoff'

export interface HandoffData {
  bot: string
  handle: string
  name: string
  role?: string
  reason: string
  title: string
  text: string
  member?: string
  at: string
}

/** Mỗi bản ghi chuyển giao thành một dòng ở mức lượt (không gập vào phần quá trình của Aris). */
export const handoffDefinition = {
  kind: 'aris-handoff',
  target: 'chat',
  match: (event: EventLike) =>
    event.type === HANDOFF_RECORD ? { id: String(event.seq), role: 'start' } : null,
  start: (_context: unknown, match: { event: EventLike }) => ({
    seq: match.event.seq,
    data: match.event.data,
  }),
  update: (context: { state: unknown }) => context.state,
  buildViewNode: (context: {
    key: string
    id: string
    state?: { seq: number; data: unknown }
    start?: { location?: unknown }
  }) =>
    context.state === undefined
      ? null
      : {
          key: context.key,
          kind: 'aris-handoff',
          id: context.id,
          target: 'chat',
          anchorSeq: context.state.seq,
          location: context.start?.location ?? { kind: 'unresolved' },
          visibility: 'visible',
          groupTree: 'turn',
          data: context.state.data,
        },
}

/** Một khối Markdown đơn giản: đoạn, tiêu đề, danh sách (đủ cho câu trả lời của bot). */
export type MdBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'code'; text: string }

/** Tách Markdown thành khối; chữ trong khối giữ nguyên để vẽ chữ đậm, mã, tên thành viên. */
export function mdBlocks(md: string): MdBlock[] {
  const out: MdBlock[] = []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join('\n') })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*```/.test(line)) {
      flush()
      const code: string[] = []
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]!); i++) code.push(lines[i]!)
      out.push({ kind: 'code', text: code.join('\n') })
      continue
    }
    const h = /^\s*#{1,6}\s+(.*)$/.exec(line)
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (h) {
      flush()
      out.push({ kind: 'h', text: h[1]! })
    } else if (ul || ol) {
      flush()
      const kind = ul ? 'ul' : 'ol'
      const item = (ul ?? ol)![1]!
      const last = out.at(-1)
      if (last && (last.kind === 'ul' || last.kind === 'ol') && last.kind === kind) last.items.push(item)
      else out.push({ kind, items: [item] })
    } else if (!line.trim()) flush()
    else para.push(line)
  }
  flush()
  return out
}
