/**
 * `/api/aris/providers/state`: thứ tự dự phòng, vòng khoá (không có giá trị khoá), chi phí, giá.
 * dsh đã kiểm cookie và quyền chủ nhân trước khi gọi tới đây.
 */
import type { ChainRecord, Link, Table } from './domain.js'
import type { KeyPools } from './keys.js'
import type { Ledger } from './ledger.js'
import type { Prices } from './prices.js'

export interface StateDeps {
  chain: Table<ChainRecord>
  pools: KeyPools
  ledger: Ledger
  prices: Prices
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

const MAX_LINKS = 8
const isLink = (v: unknown): v is Link =>
  !!v &&
  typeof (v as Link).provider === 'string' &&
  typeof (v as Link).model === 'string' &&
  (v as Link).provider.length > 0 &&
  (v as Link).model.length > 0

export const chainOf = (t: Table<ChainRecord>): readonly Link[] => t.get('main')?.links ?? []

export async function handleState(d: StateDeps, request: Request): Promise<Response> {
  if (request.method === 'GET')
    return json({ chain: chainOf(d.chain), pools: d.pools.all(), cost: d.ledger.summary() })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'JSON không hợp lệ' }, 400)
  }
  try {
    switch (body.op) {
      case 'chain': {
        const links = body.chain
        if (!Array.isArray(links) || !links.every(isLink) || links.length > MAX_LINKS)
          return json({ error: `chuỗi dự phòng phải là tối đa ${MAX_LINKS} cặp provider/model` }, 400)
        const seen = new Set<string>()
        const clean = links
          .map((l) => ({ provider: l.provider, model: l.model }))
          .filter((l) => !seen.has(`${l.provider}\n${l.model}`) && seen.add(`${l.provider}\n${l.model}`))
        await d.chain.put('main', { links: clean })
        return json({ chain: clean })
      }
      case 'key-add': {
        const { provider, ref, value } = body
        if (typeof provider !== 'string' || typeof ref !== 'string' || typeof value !== 'string')
          return json({ error: 'thiếu provider, ref hoặc value' }, 400)
        return json({ pool: await d.pools.add(provider, ref, value) })
      }
      case 'key-remove': {
        const { provider, slot } = body
        if (typeof provider !== 'string' || typeof slot !== 'number')
          return json({ error: 'thiếu provider hoặc slot' }, 400)
        return json({ pool: (await d.pools.remove(provider, slot)) ?? null })
      }
      case 'prices': {
        const items = Array.isArray(body.items) ? body.items.filter(isLink).slice(0, 500) : []
        return json({
          prices: items.map((l) => ({ ...l, price: d.prices.of(l.provider, l.model) ?? null })),
        })
      }
      default:
        return json({ error: 'op không hợp lệ' }, 400)
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
}
