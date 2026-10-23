/**
 * Lõi tìm lại: tìm phiên qua `ctx.sessionQuery` của dsh, đọc cửa sổ quanh tin khớp, tóm tắt
 * bằng model có dẫn nguồn, mở nguyên văn. Nhận dịch vụ qua tham số để kiểm thử không cần dsh.
 */
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import {
  clip,
  dayOf,
  formatRaw,
  formatResult,
  lineOf,
  summaryPrompt,
  type Line,
  type Source,
} from './text.js'

export type QueryEngine = Pick<
  SessionQueryEngine,
  'searchSessions' | 'searchEvents' | 'readEvent' | 'readTitleSnapshots'
>
export type Stream = (options: GenerateOptions) => AsyncIterable<StreamChunk>
export interface ModelRef {
  provider: string
  model: string
}

export const DEFAULT_LIMIT = 5
export const MAX_LIMIT = 10
/** Số tin đọc thêm mỗi bên tin khớp khi tóm tắt. */
export const WINDOW = 4
export const MAX_AROUND = 10

/** Một phiên khớp cho hộp tìm (không gọi model). */
export interface Hit {
  sessionId: string
  title: string
  time: number
  seq: number
  snippet: string
  /** Thư mục làm việc của phiên (dự án), nếu có. */
  cwd?: string | undefined
}

/** Chỉ lời người dùng và lời bot, bỏ tin chỉ có trong log (nhắc, bản ghi nội bộ). */
const EVENT_FILTERS = [
  { kind: 'type', values: ['user/message', 'assistant/message'] },
  { kind: 'surface', values: ['current', 'shadowed'] },
] as const

const clampLimit = (n: number | undefined) =>
  Math.min(MAX_LIMIT, Math.max(1, Math.trunc(n ?? DEFAULT_LIMIT) || DEFAULT_LIMIT))

async function titles(engine: QueryEngine, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  const results = await engine.readTitleSnapshots(ids.map((id) => SessionId(id)))
  for (const r of results)
    if (r.status === 'fulfilled' && r.value.title?.title) out.set(r.sessionId, r.value.title.title)
  return out
}

/** Các phiên khớp nhất, mỗi phiên một tin khớp; bỏ phiên đang chat. */
export async function searchHits(
  engine: QueryEngine,
  input: {
    query: string
    days?: number | undefined
    limit?: number | undefined
    exclude?: string | undefined
  },
  now = Date.now(),
): Promise<Hit[]> {
  const limit = clampLimit(input.limit)
  const filters = [
    ...EVENT_FILTERS,
    ...(input.days && input.days > 0 ? [{ kind: 'time' as const, from: now - input.days * 86_400_000 }] : []),
  ]
  // Lấy dư: phiên có tin khớp nhất là chỉ dẫn nội bộ (không phải lời) có thể bị bỏ.
  const page = await engine.searchSessions({
    query: input.query,
    eventFilters: filters as never,
    limit: Math.min(MAX_LIMIT * 2, limit * 2 + (input.exclude ? 1 : 0)),
  })
  const found: Omit<Hit, 'title'>[] = []
  for (const h of page.items) {
    if (found.length >= limit) break
    if (h.header.id === input.exclude) continue
    const line = await spokenMatch(engine, h.header.id, h.bestMatch, input.query, filters)
    if (line) found.push({ sessionId: h.header.id, ...line, cwd: h.header.cwd })
  }
  const named = await titles(
    engine,
    found.map((h) => h.sessionId),
  )
  return found.map((h) => ({ ...h, title: named.get(h.sessionId) ?? clip(h.snippet, 60) }))
}

/** Khoảng chữ quanh chỗ khớp đầu tiên, khi phải tự cắt đoạn trích. */
export function snippetAround(text: string, query: string, width = 200): string {
  const fold = (x: string) =>
    x
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
  const word = fold(query.trim().split(/\s+/)[0] ?? '')
  const at = word ? fold(text).indexOf(word) : -1
  const start = Math.max(0, (at < 0 ? 0 : at) - Math.floor(width / 3))
  const piece = text
    .slice(start, start + width)
    .replace(/\s+/g, ' ')
    .trim()
  return `${start > 0 ? '…' : ''}${piece}${start + width < text.length ? '…' : ''}`
}

/**
 * Tin khớp là lời người dùng hoặc lời bot. Tin "user" do dsh chèn (chỉ dẫn, ngữ cảnh động)
 * cũng là `user/message` nên bộ lọc loại tin không loại được: gặp thì tìm tiếp trong phiên.
 */
async function spokenMatch(
  engine: QueryEngine,
  sessionId: string,
  best: { seq: number; time: number; snippet: string },
  query: string,
  filters: readonly unknown[],
): Promise<{ seq: number; time: number; snippet: string } | undefined> {
  const spoken = async (seq: number) => {
    const w = await engine.readEvent({
      sessionId: SessionId(sessionId),
      seq: SessionSeq(seq),
      before: 0,
      after: 0,
    })
    return lineOf(w.target)
  }
  if (await spoken(best.seq)) return best
  const page = await engine.searchEvents({
    sessionId: SessionId(sessionId),
    query,
    filters: filters as never,
    limit: 20,
  })
  for (const e of page.items) {
    const line = await spoken(e.seq)
    if (line) return { seq: e.seq, time: e.time, snippet: snippetAround(line.text, query) }
  }
  return undefined
}

/** Lời người dùng và lời bot quanh một tin. */
export async function readLines(
  engine: QueryEngine,
  sessionId: string,
  seq: number,
  around: number,
): Promise<Line[]> {
  const window = await engine.readEvent({
    sessionId: SessionId(sessionId),
    seq: SessionSeq(seq),
    before: around,
    after: around,
  })
  return window.events.flatMap((e) => {
    const line = lineOf(e)
    return line ? [line] : []
  })
}

/** Đoạn trích của các phiên khớp, gắn nhãn S1, S2… */
export async function findSources(engine: QueryEngine, hits: readonly Hit[]): Promise<Source[]> {
  const sources: Source[] = []
  for (const [i, h] of hits.entries()) {
    const lines = await readLines(engine, h.sessionId, h.seq, WINDOW)
    // Tin khớp có thể là tin không phải lời (hiếm): vẫn giữ đoạn trích của dsh.
    if (!lines.length) lines.push({ seq: h.seq, role: 'user', text: h.snippet })
    sources.push({
      label: `S${i + 1}`,
      sessionId: h.sessionId,
      title: h.title,
      time: h.time,
      seq: h.seq,
      lines,
    })
  }
  return sources
}

/**
 * Trần token của lời gọi tóm tắt. Model có suy luận (DeepSeek, o-series…) tính cả phần suy
 * nghĩ vào trần: trần thấp thì hết token trước khi kịp viết chữ nào.
 */
export const SUMMARY_MAX_TOKENS = 6000

/** Tóm tắt có dẫn nguồn; model lỗi thì trả đoạn trích thô. */
export async function summarize(
  stream: Stream,
  model: ModelRef | undefined,
  query: string,
  sources: readonly Source[],
  signal?: AbortSignal,
): Promise<{ text: string; summarized: boolean }> {
  if (!model) return { text: formatRaw(sources, 'chưa biết model của phiên'), summarized: false }
  try {
    let out = ''
    let thought = false
    let cut = false
    for await (const chunk of stream({
      provider: model.provider,
      model: model.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: summaryPrompt(query, sources) }] }],
      maxTokens: SUMMARY_MAX_TOKENS,
      ...(signal ? { signal } : {}),
    })) {
      if (chunk.type === 'text-delta') out += chunk.text
      else if (chunk.type === 'reasoning-delta') thought = true
      else if (chunk.type === 'finish') {
        if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')
          return { text: formatRaw(sources, chunk.reason.failure.message), summarized: false }
        cut = chunk.reason.kind === 'max-tokens'
      }
    }
    if (!out.trim()) {
      const why = cut && thought ? 'model hết trần token khi đang suy luận' : 'model không trả lời'
      return { text: formatRaw(sources, why), summarized: false }
    }
    return { text: formatResult(out, sources), summarized: true }
  } catch (err) {
    return { text: formatRaw(sources, err instanceof Error ? err.message : String(err)), summarized: false }
  }
}

/** Nguyên văn quanh một tin, để trích chính xác. */
export async function openText(
  engine: QueryEngine,
  sessionId: string,
  seq: number,
  around = 2,
): Promise<string> {
  const n = Math.min(MAX_AROUND, Math.max(0, Math.trunc(around)))
  const window = await engine.readEvent({
    sessionId: SessionId(sessionId),
    seq: SessionSeq(seq),
    before: n,
    after: n,
  })
  const lines = window.events.flatMap((e) => {
    const line = lineOf(e)
    return line ? [line] : []
  })
  if (!lines.length) return `Phiên ${sessionId}, tin ${seq}: không có lời người dùng hay lời bot quanh đây.`
  const head = `Phiên ${sessionId} · ${dayOf(window.target.time)}`
  return [
    head,
    ...lines.map((l) => `#${l.seq} ${l.role === 'user' ? 'Người dùng' : 'Bot'}: ${clip(l.text, 6000)}`),
  ].join('\n')
}
