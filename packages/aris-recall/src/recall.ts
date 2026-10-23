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

export type QueryEngine = Pick<SessionQueryEngine, 'searchSessions' | 'readEvent' | 'readTitleSnapshots'>
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

/** Chỉ lời chủ nhân và lời bot, bỏ tin chỉ có trong log (nhắc, bản ghi nội bộ). */
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
  const page = await engine.searchSessions({
    query: input.query,
    eventFilters: filters as never,
    limit: limit + (input.exclude ? 1 : 0),
  })
  const items = page.items.filter((h) => h.header.id !== input.exclude).slice(0, limit)
  const named = await titles(
    engine,
    items.map((h) => h.header.id),
  )
  return items.map((h) => ({
    sessionId: h.header.id,
    title: named.get(h.header.id) ?? clip(h.bestMatch.snippet, 60),
    time: h.bestMatch.time,
    seq: h.bestMatch.seq,
    snippet: h.bestMatch.snippet,
    cwd: h.header.cwd,
  }))
}

/** Lời chủ nhân và lời bot quanh một tin. */
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
    for await (const chunk of stream({
      provider: model.provider,
      model: model.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: summaryPrompt(query, sources) }] }],
      maxTokens: 900,
      ...(signal ? { signal } : {}),
    })) {
      if (chunk.type === 'text-delta') out += chunk.text
      else if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted'))
        return { text: formatRaw(sources, chunk.reason.failure.message), summarized: false }
    }
    if (!out.trim()) return { text: formatRaw(sources, 'model không trả lời'), summarized: false }
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
  if (!lines.length) return `Phiên ${sessionId}, tin ${seq}: không có lời chủ nhân hay lời bot quanh đây.`
  const head = `Phiên ${sessionId} · ${dayOf(window.target.time)}`
  return [
    head,
    ...lines.map((l) => `#${l.seq} ${l.role === 'user' ? 'Chủ nhân' : 'Bot'}: ${clip(l.text, 6000)}`),
  ].join('\n')
}
