/**
 * Nhúng (tìm theo nghĩa, giai đoạn 5 đợt 5a): gọi model nhúng của Gemini qua REST, khoá lấy từ kho khoá của dsh.
 * Thuần phần dựng yêu cầu, đọc kết quả và phân loại lỗi; phần gọi mạng nhận `fetch` và hàm đọc khoá từ ngoài.
 */

export const EMBED_MODELS = [
  { provider: 'google', model: 'gemini-embedding-2', dims: 768, maxChars: 24000 },
  { provider: 'google', model: 'gemini-embedding-001', dims: 768, maxChars: 6000 },
] as const

export type EmbedMode = 'doc' | 'query'

export interface EmbedRequest {
  provider: string
  model: string
  texts: readonly string[]
  mode: EmbedMode
  /** Tiêu đề cho từng đoạn khi nhúng tài liệu (giúp model hiểu ngữ cảnh). */
  titles?: readonly (string | undefined)[] | undefined
}

export type EmbedErrorKind = 'nokey' | 'key' | 'rate' | 'model' | 'network' | 'other'

export class EmbedError extends Error {
  constructor(
    readonly kind: EmbedErrorKind,
    message: string,
    /** Hạn mức: thử lại sau bao nhiêu mili giây (theo lời máy chủ, nếu có). */
    readonly retryMs?: number,
  ) {
    super(message)
  }
}

/** Tên khoá có thể chứa khoá Gemini (theo cách dsh đặt tên, rồi tên quen của Google). */
export const GOOGLE_KEY_REFS = ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'] as const

export const modelInfo = (provider: string, model: string) =>
  EMBED_MODELS.find((m) => m.provider === provider && m.model === model)

/** Chữ gửi đi: gemini-embedding-2 không nhận task_type nên ghi việc vào đầu chữ như tài liệu của Google. */
export function framed(model: string, text: string, mode: EmbedMode, title?: string): string {
  if (model !== 'gemini-embedding-2') return text
  return mode === 'query'
    ? `task: search result | query: ${text}`
    : `title: ${title || 'none'} | text: ${text}`
}

/** Thân yêu cầu `batchEmbedContents`. */
export function batchBody(r: EmbedRequest, dims: number) {
  const legacy = r.model !== 'gemini-embedding-2'
  return {
    requests: r.texts.map((t, i) => ({
      model: `models/${r.model}`,
      content: { parts: [{ text: framed(r.model, t, r.mode, r.titles?.[i]) }] },
      output_dimensionality: dims,
      ...(legacy ? { taskType: r.mode === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' } : {}),
    })),
  }
}

/** Chuẩn hoá về độ dài 1 (để tích vô hướng là cosine). */
export function normalize(v: readonly number[]): Float32Array {
  const out = Float32Array.from(v)
  let s = 0
  for (const x of out) s += x * x
  const n = Math.sqrt(s) || 1
  for (let i = 0; i < out.length; i++) out[i]! /= n
  return out
}

/** Giờ thử lại trong lỗi 429 của Google (`retryDelay: "37s"`), tính mili giây. */
export function retryOf(body: unknown): number | undefined {
  const details = (body as { error?: { details?: { retryDelay?: unknown }[] } } | undefined)?.error?.details
  for (const d of details ?? []) {
    const m = typeof d.retryDelay === 'string' ? /^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay) : null
    if (m) return Math.ceil(Number(m[1]) * 1000)
  }
  return undefined
}

export function classifyStatus(status: number, body: unknown): EmbedError {
  const msg =
    (body as { error?: { message?: unknown } } | undefined)?.error?.message ??
    (typeof body === 'string' ? body : `HTTP ${status}`)
  const text = String(msg).slice(0, 300)
  if (status === 429) return new EmbedError('rate', text, retryOf(body) ?? 60_000)
  if (status === 401 || status === 403) return new EmbedError('key', text)
  if (status === 400 && /api key/i.test(text)) return new EmbedError('key', text)
  if (status === 404) return new EmbedError('model', text)
  return new EmbedError('other', text)
}

export interface EmbedDeps {
  fetch: typeof fetch
  /** Đọc khoá theo tên trong kho khoá của dsh. */
  key(ref: string): Promise<string | undefined>
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
/** Google nhận tối đa 100 yêu cầu trong một lần gọi lô. */
export const BATCH = 100

export async function embed(d: EmbedDeps, r: EmbedRequest): Promise<Float32Array[]> {
  const info = modelInfo(r.provider, r.model)
  if (!info) throw new EmbedError('model', `chưa hỗ trợ model nhúng ${r.provider}/${r.model}`)
  let key: string | undefined
  for (const ref of GOOGLE_KEY_REFS) {
    key = await d.key(ref)
    if (key) break
  }
  if (!key) throw new EmbedError('nokey', 'chưa có khoá Google Gemini')
  const out: Float32Array[] = []
  for (let i = 0; i < r.texts.length; i += BATCH) {
    const part = {
      ...r,
      texts: r.texts.slice(i, i + BATCH).map((t) => t.slice(0, info.maxChars)),
      titles: r.titles?.slice(i, i + BATCH),
    }
    let res: Response
    try {
      res = await d.fetch(`${BASE}/${r.model}:batchEmbedContents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(batchBody(part, info.dims)),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (e) {
      throw new EmbedError('network', String(e))
    }
    const body = (await res.json().catch(() => undefined)) as
      { embeddings?: { values?: number[] }[] } | undefined
    if (!res.ok) throw classifyStatus(res.status, body)
    const list = body?.embeddings ?? []
    if (list.length !== part.texts.length) throw new EmbedError('other', 'số vector trả về không khớp')
    for (const e of list) out.push(normalize(e.values ?? []))
  }
  return out
}
