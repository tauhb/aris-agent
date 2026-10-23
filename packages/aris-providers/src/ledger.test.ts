import { describe, expect, it } from 'vitest'
import type { LedgerRecord, SpendRecord } from './domain.js'
import { dayOf, Ledger } from './ledger.js'
import { costOf, createPrices } from './prices.js'
import { memTable } from './testing.js'

const prices = createPrices((p) =>
  p === 'deepseek'
    ? [{ id: 'deepseek-flash', cost: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 } }]
    : p === 'openrouter'
      ? [
          {
            id: 'deepseek/deepseek-v4-flash-latest',
            cost: { input: 0.04, output: 0.17, cacheRead: 0.03, cacheWrite: 0 },
          },
        ]
      : [],
)

describe('giá và sổ chi phí', () => {
  it('tra giá: route DeepSeek chính thức, bí danh ~ của OpenRouter, model không có', () => {
    expect(prices.of('deepseek-official', 'deepseek-flash')?.input).toBe(0.3)
    expect(prices.of('openrouter', '~deepseek/deepseek-v4-flash-latest')?.output).toBe(0.17)
    expect(prices.of('groq', 'llama')).toBeUndefined()
  })

  it('tiền một lần gọi: token rời nhau, đọc cache rẻ hơn', () => {
    const p = prices.of('deepseek-official', 'deepseek-flash')!
    expect(costOf(p, { inputTokens: 16361, outputTokens: 11, cacheReadTokens: 512 })).toBeCloseTo(
      (16361 * 0.3 + 11 * 1.2 + 512 * 0.006) / 1e6,
      12,
    )
  })

  it('cộng dồn theo ngày và model; báo khi có model chưa có giá', async () => {
    const ledger = new Ledger(memTable<LedgerRecord>(), prices)
    const now = new Date(2026, 9, 23, 15).getTime()
    const u = { inputTokens: 1_000_000, outputTokens: 0 }
    await ledger.record('deepseek-official', 'deepseek-flash', u, now)
    await ledger.record('deepseek-official', 'deepseek-flash', u, now)
    await ledger.record('deepseek-official', 'deepseek-flash', u, now - 3 * 86_400_000)
    await ledger.record('deepseek-official', 'deepseek-flash', u, now - 9 * 86_400_000)
    expect(ledger.summary(now)).toMatchObject({ today: 0.6, unpriced: false })
    expect(ledger.summary(now).week).toBeCloseTo(0.9)
    await ledger.record('groq', 'llama', u, now)
    const s = ledger.summary(now)
    expect(s.unpriced).toBe(true)
    expect(s.byModel).toEqual([
      { provider: 'deepseek-official', model: 'deepseek-flash', usd: 0.6, calls: 2, priced: true },
      { provider: 'groq', model: 'llama', usd: 0, calls: 1, priced: false },
    ])
    expect(dayOf(now)).toBe('2026-10-23')
  })
})

describe('chi phí theo phòng ban', () => {
  it('cộng theo phạm vi trong ngày; không phạm vi thì không cộng; model chưa có giá không tính', async () => {
    const prices = {
      of: (_p: string, m: string) =>
        m === 'free' ? undefined : { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    } as never
    const spend = memTable<SpendRecord>()
    const ledger = new Ledger(memTable<LedgerRecord>(), prices, spend)
    const at = Date.UTC(2026, 9, 24, 3)
    const u = { inputTokens: 1_000_000, outputTokens: 0 }
    await ledger.record('p', 'm', u, at, 'ky-thuat')
    await ledger.record('p', 'm', u, at, 'ky-thuat')
    await ledger.record('p', 'm', u, at)
    await ledger.record('p', 'free', u, at, 'ky-thuat')
    expect(ledger.spentToday(at)).toEqual({ 'ky-thuat': 2 })
    expect(ledger.spentToday(at + 86_400_000)).toEqual({})
  })
})
