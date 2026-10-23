/**
 * Gọi thử một model để kiểm tra kết nối (nút "Kiểm tra kết nối" ở trang 6.2).
 * Dò danh sách model của dsh không đủ: route nào dsh đã biết sẵn model thì trả từ hiểu
 * biết đó mà không gọi mạng. Nên ở đây gửi một tin rất ngắn, đo thời gian tới chữ đầu.
 */
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

export interface ProbeResult {
  ok: boolean
  /** Thời gian tới chữ đầu tiên (hoặc tới khi lỗi), mili giây. */
  ms: number
  error?: string | undefined
}

export type Stream = (options: GenerateOptions) => AsyncIterable<StreamChunk>

const ID_RE = /^[A-Za-z0-9._:/@-]{1,200}$/

/** Kiểm đầu vào; trả lỗi bằng lời hoặc undefined khi hợp lệ. */
export function probeInputError(provider: unknown, model: unknown): string | undefined {
  if (typeof provider !== 'string' || !ID_RE.test(provider)) return 'provider không hợp lệ'
  if (typeof model !== 'string' || !ID_RE.test(model)) return 'model không hợp lệ'
  return undefined
}

export async function probe(
  stream: Stream,
  provider: string,
  model: string,
  now: () => number = () => performance.now(),
  timeoutMs = 20_000,
): Promise<ProbeResult> {
  const start = now()
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  const took = () => Math.round(now() - start)
  try {
    for await (const chunk of stream({
      provider,
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
      maxTokens: 8,
      signal: abort.signal,
    })) {
      // Có chữ đầu (kể cả phần suy luận) là đủ biết khoá và đường mạng chạy.
      if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta' || chunk.type === 'block-start')
        return { ok: true, ms: took() }
      if (chunk.type === 'finish') {
        const r = chunk.reason
        if (r.kind === 'error' || r.kind === 'aborted')
          return {
            ok: false,
            ms: took(),
            error: abort.signal.aborted ? 'quá thời gian chờ' : r.failure.message,
          }
        return { ok: true, ms: took() }
      }
    }
    return { ok: true, ms: took() }
  } catch (err) {
    return { ok: false, ms: took(), error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
    abort.abort()
  }
}
