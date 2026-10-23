import { describe, expect, it } from 'vitest'
import { ChannelStore, normalizeCode, threadKey, type Table, type Tables } from './store.js'

export function memTable<V>(): Table<V> {
  const m = new Map<string, V>()
  return {
    get: (k) => m.get(k),
    entries: () => m.entries(),
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => m.delete(k),
  }
}

export function memStore(now: () => number = Date.now) {
  const t: Tables = {
    bots: memTable(),
    people: memTable(),
    groups: memTable(),
    codes: memTable(),
    threads: memTable(),
    inbox: memTable(),
    outbox: memTable(),
    settings: memTable(),
  }
  return new ChannelStore(t, now)
}

describe('kho kênh', () => {
  it('khoá cuộc trò chuyện gồm bot, chat, chủ đề; số âm hợp lệ với storage', () => {
    expect(threadKey(900, -1001, 7)).toBe('tg-900-n1001-t7')
    expect(threadKey(900, 55)).toBe('tg-900-55')
  })

  it('mã ghép đôi: dùng một lần, có hạn, chuẩn hoá cách gõ', async () => {
    let now = 1_000
    const s = memStore(() => now)
    const code = await s.createCode('owner')
    expect(code.code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/)
    expect(normalizeCode(code.code.toLowerCase().replace('-', ' '))).toBe(code.code)
    expect(normalizeCode('xin chào')).toBeUndefined()
    const p = await s.redeem(code.code, { id: 1, name: 'Tầu' })
    expect(p).toMatchObject({ userId: 1, role: 'owner' })
    expect(s.roleOf(1)).toBe('owner')
    expect(await s.redeem(code.code, { id: 2, name: 'B' })).toBeUndefined()
    const late = await s.createCode('member')
    now += 11 * 60_000
    expect(await s.redeem(late.code, { id: 3, name: 'C' })).toBeUndefined()
  })

  it('mã người được phép không hạ quyền chủ nhân', async () => {
    const s = memStore()
    await s.redeem((await s.createCode('owner')).code, { id: 1, name: 'A' })
    await s.redeem((await s.createCode('member')).code, { id: 1, name: 'A' })
    expect(s.roleOf(1)).toBe('owner')
  })

  it('báo người lạ tối đa một lần mỗi giờ', async () => {
    let now = 0
    const s = memStore(() => now)
    expect(await s.shouldNotifyStranger(9)).toBe(true)
    expect(await s.shouldNotifyStranger(9)).toBe(false)
    now += 3_600_001
    expect(await s.shouldNotifyStranger(9)).toBe(true)
  })

  it('đổi phiên giữ lịch sử để /sessions, /resume', async () => {
    const s = memStore()
    const base = { key: 'k', bot: 'aris', chatId: 1 }
    await s.bindThread({ ...base, sessionId: 's1' })
    await s.bindThread({ ...base, sessionId: 's2' })
    const t = await s.bindThread({ ...base, sessionId: 's1' })
    expect(t).toMatchObject({ sessionId: 's1', history: ['s2'] })
    expect(s.threadOfSession('s1')?.key).toBe('k')
  })
})
