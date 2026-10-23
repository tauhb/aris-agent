/**
 * Giá model từ bảng giá có sẵn của pi-ai (thư viện mà dsh-llm-pi-ai dùng): USD cho mỗi
 * 1 triệu token. Route DeepSeek chính thức của dsh tra theo bảng `deepseek` của pi-ai.
 */
import { getModels } from '@earendil-works/pi-ai/compat'

export interface Price {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** Route dsh → nhà cung cấp trong bảng giá pi-ai (mặc định trùng tên). */
const CATALOG: Record<string, string> = { 'deepseek-official': 'deepseek' }

type Lookup = (provider: string) => readonly { id: string; cost?: Price }[]

const piLookup: Lookup = (provider) => {
  try {
    return getModels(provider as never) as readonly { id: string; cost?: Price }[]
  } catch {
    return []
  }
}

export function createPrices(lookup: Lookup = piLookup) {
  const cache = new Map<string, Map<string, Price>>()
  const table = (provider: string) => {
    const name = CATALOG[provider] ?? provider
    let t = cache.get(name)
    if (!t) {
      t = new Map()
      for (const m of lookup(name)) if (m.cost) t.set(m.id, m.cost)
      cache.set(name, t)
    }
    return t
  }
  return {
    /** Giá một model; không có trong bảng (hoặc giá 0 vì chưa biết) thì undefined. */
    of(provider: string, model: string): Price | undefined {
      const t = table(provider)
      // OpenRouter có bí danh `~tên` cho bản mới nhất.
      const p = t.get(model) ?? t.get(model.replace(/^~/, ''))
      return p
    },
  }
}
export type Prices = ReturnType<typeof createPrices>

/** Tiền của một lần gọi (USD). Các số token là rời nhau (dsh trừ phần đọc cache khỏi đầu vào). */
export function costOf(price: Price, u: Usage): number {
  return (
    (u.inputTokens * price.input +
      u.outputTokens * price.output +
      (u.cacheReadTokens ?? 0) * price.cacheRead +
      (u.cacheWriteTokens ?? 0) * price.cacheWrite) /
    1_000_000
  )
}
