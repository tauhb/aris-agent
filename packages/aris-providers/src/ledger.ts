/** Sổ chi phí: cộng dồn số token và tiền của mỗi lần gọi model theo ngày, provider, model. */
import { createHash } from 'node:crypto'
import type { LedgerRecord, Table } from './domain.js'
import { costOf, type Prices, type Usage } from './prices.js'

/** Ngày theo giờ máy, dạng `2026-10-23`. */
export function dayOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const keyOf = (day: string, provider: string, model: string) =>
  `${day}-${createHash('sha256').update(`${provider}\n${model}`).digest('hex').slice(0, 16)}`

export interface CostSummary {
  today: number
  week: number
  /** Có lần gọi hôm nay mà model chưa có giá (tổng thấp hơn thực tế). */
  unpriced: boolean
  byModel: { provider: string; model: string; usd: number; calls: number; priced: boolean }[]
}

export class Ledger {
  constructor(
    private table: Table<LedgerRecord>,
    private prices: Prices,
  ) {}

  async record(provider: string, model: string, usage: Usage, at = Date.now()): Promise<void> {
    const day = dayOf(at)
    const key = keyOf(day, provider, model)
    const price = this.prices.of(provider, model)
    const prev = this.table.get(key) ?? {
      day,
      provider,
      model,
      calls: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      usd: 0,
      priced: true,
    }
    await this.table.put(key, {
      ...prev,
      calls: prev.calls + 1,
      input: prev.input + usage.inputTokens,
      output: prev.output + usage.outputTokens,
      cacheRead: prev.cacheRead + (usage.cacheReadTokens ?? 0),
      cacheWrite: prev.cacheWrite + (usage.cacheWriteTokens ?? 0),
      usd: prev.usd + (price ? costOf(price, usage) : 0),
      priced: prev.priced && price !== undefined,
    })
  }

  summary(now = Date.now()): CostSummary {
    const today = dayOf(now)
    const week = new Set(Array.from({ length: 7 }, (_, i) => dayOf(now - i * 86_400_000)))
    const out: CostSummary = { today: 0, week: 0, unpriced: false, byModel: [] }
    for (const [, r] of this.table.entries()) {
      if (week.has(r.day)) out.week += r.usd
      if (r.day !== today) continue
      out.today += r.usd
      if (!r.priced) out.unpriced = true
      out.byModel.push({ provider: r.provider, model: r.model, usd: r.usd, calls: r.calls, priced: r.priced })
    }
    out.byModel.sort((a, b) => b.usd - a.usd)
    return out
  }
}
