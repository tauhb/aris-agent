import { describe, expect, it } from 'vitest'
import { handleState } from './api.js'
import type { ChainRecord, LedgerRecord, PoolRecord } from './domain.js'
import { KeyPools } from './keys.js'
import { Ledger } from './ledger.js'
import { createPrices } from './prices.js'
import { memCreds, memTable } from './testing.js'

function deps() {
  const prices = createPrices((p) =>
    p === 'groq' ? [{ id: 'm', cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } }] : [],
  )
  return {
    chain: memTable<ChainRecord>(),
    pools: new KeyPools(memTable<PoolRecord>(), memCreds({ G_KEY: 'secret-1' })),
    ledger: new Ledger(memTable<LedgerRecord>(), prices),
    prices,
  }
}
const post = (body: unknown) =>
  new Request('http://x/api/aris/providers/state', { method: 'POST', body: JSON.stringify(body) })

describe('/api/aris/providers/state', () => {
  it('ghi chuỗi (bỏ trùng), thêm khoá, tra giá; trạng thái không chứa giá trị khoá', async () => {
    const d = deps()
    const link = { provider: 'groq', model: 'm' }
    const r1 = await handleState(d, post({ op: 'chain', chain: [link, link, { provider: 'x', model: 'y' }] }))
    expect(((await r1.json()) as { chain: unknown[] }).chain).toHaveLength(2)
    expect((await handleState(d, post({ op: 'chain', chain: [{ provider: '' }] }))).status).toBe(400)
    await handleState(d, post({ op: 'key-add', provider: 'groq', ref: 'G_KEY', value: 'secret-2' }))
    const state = await (await handleState(d, new Request('http://x/'))).text()
    expect(state).not.toContain('secret')
    expect(JSON.parse(state).pools[0].keys).toHaveLength(2)
    const prices = await (
      await handleState(d, post({ op: 'prices', items: [link, { provider: 'x', model: 'y' }] }))
    ).json()
    expect(prices).toEqual({
      prices: [
        { ...link, price: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } },
        { provider: 'x', model: 'y', price: null },
      ],
    })
    expect((await handleState(d, post({ op: 'key-remove', provider: 'groq', slot: 1 }))).status).toBe(400)
  })
})
