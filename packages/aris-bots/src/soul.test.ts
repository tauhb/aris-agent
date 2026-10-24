import { describe, expect, it } from 'vitest'
import { handleApi } from './api.js'
import { cleanRewrite, rewritePrompt, SoulHistory } from './soul.js'
import { BotStore } from './store.js'
import { memTable, memTables } from './testing.js'

let tick = 0
const now = () => new Date(Date.UTC(2026, 9, 24, 0, 0, tick++))

const setup = async (rewrite?: (p: string) => Promise<string>) => {
  const store = new BotStore(memTables(), now)
  await store.ensureCommander()
  const souls = new SoulHistory(memTable(), now)
  const call = async (body: unknown) => {
    const r = await handleApi(
      { store, templates: async () => [], open: async () => 's', souls, ...(rewrite ? { rewrite } : {}) },
      new Request('http://x/api/aris/bots', { method: 'POST', body: JSON.stringify(body) }),
    )
    return { status: r.status, body: (await r.json()) as Record<string, unknown> }
  }
  return { store, souls, call }
}

describe('tính cách theo phiên bản', () => {
  it('sửa SOUL thì ghi phiên bản; bản gốc thành phiên bản 1; khôi phục là phiên bản mới', async () => {
    const { store, souls, call } = await setup()
    const b = await store.create({ handle: 'lam', name: 'Lâm', soul: 'Bản gốc' })
    expect(souls.meta(b)).toEqual({ version: 1, at: b.createdAt })
    await call({ op: 'update', id: b.id, patch: { soul: 'Bản hai' } })
    await call({ op: 'update', id: b.id, patch: { soul: 'Bản ba' }, soulBy: 'aris' })
    await call({ op: 'update', id: b.id, patch: { role: 'chỉ đổi vai' } })
    const h = await call({ op: 'soul-history', id: b.id })
    expect(
      (h.body.versions as { version: number; by: string; soul: string }[]).map((v) => [
        v.version,
        v.by,
        v.soul,
      ]),
    ).toEqual([
      [3, 'aris', 'Bản ba'],
      [2, 'user', 'Bản hai'],
      [1, 'create', 'Bản gốc'],
    ])
    await call({ op: 'soul-restore', id: b.id, version: 1 })
    expect(store.get(b.id)!.soul).toBe('Bản gốc')
    expect(souls.list(b.id)[0]).toMatchObject({ version: 4, by: 'restore', from: 1 })
    const snap = await call({ op: 'soul-history', id: 'khong-co' })
    expect(snap.status).toBe(400)
  })

  it('nhờ Aris viết lại: lời nhắc có vai trò và mong muốn; câu trả lời được làm sạch', async () => {
    let seen = ''
    const { store, call } = await setup(async (p) => {
      seen = p
      return '```\nĐây là bản viết lại:\n- Bạn là Lâm, cẩn thận.\n- Luôn ghi nguồn.\n```'
    })
    const b = await store.create({ handle: 'lam', name: 'Lâm', role: 'Nghiên cứu', soul: 'Cũ' })
    const r = await call({ op: 'soul-rewrite', id: b.id, wish: 'ngắn hơn' })
    expect(r.body.soul).toBe('Bạn là Lâm, cẩn thận.\nLuôn ghi nguồn.')
    expect(seen).toContain('Vai trò: Nghiên cứu.')
    expect(seen).toContain('Người dùng muốn: ngắn hơn')
    expect(store.get(b.id)!.soul).toBe('Cũ')
    expect(rewritePrompt(b, '', '')).toContain('(trống)')
    expect(cleanRewrite('1. Một\n2) Hai')).toBe('Một\nHai')
  })
})
