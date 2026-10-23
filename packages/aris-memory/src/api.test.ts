import { describe, expect, it } from 'vitest'
import { handleApi, type MemorySnapshot } from './api.js'
import { MemoryStore, type MemoryItem, type MemoryTable } from './store.js'

function setup() {
  const map = new Map<string, MemoryItem>()
  const table: MemoryTable = {
    get: (k) => map.get(k),
    entries: () => map.entries(),
    put: async (k, v) => void map.set(k, v),
  }
  return new MemoryStore(table)
}

const get = (bot = 'aris') => new Request(`http://x/api/aris/memory?bot=${bot}`)
const post = (body: unknown, bot = 'aris') =>
  new Request(`http://x/api/aris/memory?bot=${bot}`, { method: 'POST', body: JSON.stringify(body) })

describe('/api/aris/memory', () => {
  it('trả ảnh chụp theo bot', async () => {
    const s = setup()
    await s.save({ bot: 'aris', text: 'A', kind: 'fact', book: 'owner', tier: 'core', trust: 'user-stated' })
    await s.save({
      bot: 'aris',
      text: 'B',
      kind: 'fact',
      book: 'notes',
      tier: 'archive',
      trust: 'agent-inferred',
    })
    await s.save({
      bot: 'aris',
      text: 'C',
      kind: 'fact',
      book: 'owner',
      tier: 'core',
      trust: 'agent-inferred',
      status: 'pending',
    })
    const body = (await (await handleApi(s, get())).json()) as MemorySnapshot
    expect([body.core.length, body.archive.length, body.pending.length]).toEqual([1, 1, 1])
    expect(body.usage.owner).toEqual({ used: 1, cap: 1375 })
  })

  it('thao tác trên ký ức và từ chối sai bot, sai op', async () => {
    const s = setup()
    const m = await s.save({
      bot: 'aris',
      text: 'A',
      kind: 'fact',
      book: 'owner',
      tier: 'core',
      trust: 'user-stated',
    })
    const r = (await (await handleApi(s, post({ op: 'demote', id: m.id }))).json()) as MemorySnapshot
    expect(r.archive.map((x) => x.id)).toEqual([m.id])
    expect((await handleApi(s, post({ op: 'demote', id: m.id }, 'lam'))).status).toBe(404)
    expect((await handleApi(s, post({ op: 'xoa', id: m.id }))).status).toBe(400)
    expect((await handleApi(s, get('../x'))).status).toBe(400)
  })
})
